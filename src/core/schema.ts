/**
 * Validação, padrões e (de)serialização do `ChartSpec`.
 *
 * Um arquivo `.datastories.json` salvo hoje precisa abrir amanhã. O zod aqui
 * não é burocracia: ele preenche o que falta com o padrão, o que significa que
 * acrescentar um campo novo ao spec não invalida os arquivos já salvos.
 */

import { z } from 'zod'
import type { ChartSpec } from './types'
import { SPEC_VERSION } from './types'
import { DEFAULT_THEME_ID } from './theme/themes'
import { emptySource } from './dataset/parse'
import { DEFAULT_TRANSFORM } from './dataset/transform'

const columnType = z.enum(['number', 'date', 'category'])

const dataSource = z.object({
  header: z.array(z.string()).default([]),
  rows: z.array(z.array(z.string())).default([]),
  overrides: z.record(columnType).default({}),
  locale: z.enum(['pt-BR', 'en-US']).default('pt-BR'),
})

const transform = z.object({
  transpose: z.boolean().default(false),
  sortBy: z.string().nullable().default(null),
  sortDirection: z.enum(['asc', 'desc', 'none']).default('none'),
  limit: z.number().int().positive().nullable().default(null),
  hiddenColumns: z.array(z.string()).default([]),
  hiddenRows: z.array(z.number().int()).default([]),
})

const chartOptions = z.object({
  stack: z.enum(['none', 'stacked', 'stacked100']).default('none'),
  curve: z.enum(['linear', 'smooth', 'step']).default('linear'),
  strokeWidth: z.number().min(0.5).max(10).default(2.4),
  showPoints: z.boolean().default(false),
  fillOpacity: z.number().min(0).max(1).default(0.18),
  barPadding: z.number().min(0).max(0.9).default(0.22),
  innerRadius: z.number().min(0).max(0.92).default(0.58),
  bins: z.number().int().positive().nullable().default(null),
  waffleCells: z.number().int().min(9).max(400).default(100),
  pointRadius: z.number().min(1).max(20).default(3.5),
})

const encoding = z.object({
  x: z.string().nullable().default(null),
  y: z.array(z.string()).default([]),
  series: z.string().nullable().default(null),
  size: z.string().nullable().default(null),
  label: z.string().nullable().default(null),
  target: z.string().nullable().default(null),
})

const axis = z.object({
  title: z.string().default(''),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  zero: z.boolean().default(false),
  grid: z.boolean().default(true),
  ticks: z.number().int().positive().nullable().default(null),
  format: z.string().nullable().default(null),
  unit: z.string().default(''),
  visible: z.boolean().default(true),
  log: z.boolean().default(false),
})

const connector = z.object({
  enabled: z.boolean().default(true),
  tx: z.number().default(0.5),
  ty: z.number().default(0.5),
  arrow: z.boolean().default(true),
})

const annotation = z.discriminatedUnion('kind', [
  z.object({
    id: z.string(),
    kind: z.literal('text'),
    text: z.string().default(''),
    x: z.number().default(0.5),
    y: z.number().default(0.2),
    align: z.enum(['left', 'center', 'right']).default('left'),
    size: z.number().min(8).max(48).default(13),
    bold: z.boolean().default(false),
    color: z.string().nullable().default(null),
    background: z.boolean().default(false),
    connector: connector.default({ enabled: true, tx: 0.5, ty: 0.5, arrow: true }),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('range'),
    axis: z.enum(['x', 'y']).default('x'),
    from: z.string().default(''),
    to: z.string().default(''),
    label: z.string().default(''),
    color: z.string().nullable().default(null),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('line'),
    axis: z.enum(['x', 'y']).default('y'),
    value: z.string().default(''),
    label: z.string().default(''),
    dash: z.boolean().default(true),
    color: z.string().nullable().default(null),
  }),
  z.object({
    id: z.string(),
    kind: z.literal('point'),
    series: z.string().default(''),
    rowIndex: z.number().int().min(0).default(0),
    label: z.string().default(''),
    showValue: z.boolean().default(true),
    color: z.string().nullable().default(null),
  }),
])

const themeTokens = z
  .object({
    background: z.string(),
    foreground: z.string(),
    muted: z.string(),
    grid: z.string(),
    axis: z.string(),
    mutedSeries: z.string(),
    fontFamily: z.string(),
    titleFamily: z.string(),
    titleSize: z.number(),
    titleWeight: z.number(),
    subtitleSize: z.number(),
    labelSize: z.number(),
    footerSize: z.number(),
    palette: z.array(z.string()),
    sequential: z.array(z.string()),
    diverging: z.array(z.string()),
    accent: z.string(),
    rule: z.boolean(),
  })
  .partial()

export const chartSpecSchema = z.object({
  specVersion: z.literal(SPEC_VERSION).default(SPEC_VERSION),
  id: z.string().default(() => newId()),
  chart: z
    .object({
      type: z
        .enum([
          'bar',
          'bar-horizontal',
          'line',
          'area',
          'scatter',
          'dumbbell',
          'slope',
          'lollipop',
          'bullet',
          'histogram',
          'boxplot',
          'donut',
          'waffle',
          'treemap',
        ])
        .default('bar'),
      options: chartOptions.default({}),
    })
    .default({ type: 'bar', options: chartOptions.parse({}) }),
  data: dataSource.default(emptySource()),
  transform: transform.default(DEFAULT_TRANSFORM),
  encoding: encoding.default({}),
  axes: z
    .object({ x: axis.default({}), y: axis.default({}) })
    .default({ x: axis.parse({}), y: axis.parse({}) }),
  color: z
    .object({
      kind: z.enum(['categorical', 'sequential', 'diverging', 'single']).default('categorical'),
      overrides: z.record(z.string()).default({}),
      reverse: z.boolean().default(false),
    })
    .default({}),
  highlight: z
    .object({
      series: z.array(z.string()).default([]),
      categories: z.array(z.string()).default([]),
    })
    .default({}),
  labels: z
    .object({
      directLabels: z.boolean().default(true),
      legend: z.enum(['auto', 'off', 'top']).default('auto'),
      valueLabels: z.boolean().default(false),
      labelHighlightedOnly: z.boolean().default(false),
    })
    .default({}),
  annotations: z.array(annotation).default([]),
  text: z
    .object({
      title: z.string().default(''),
      subtitle: z.string().default(''),
      source: z.string().default(''),
      sourceUrl: z.string().default(''),
      note: z.string().default(''),
      credit: z.string().default(''),
    })
    .default({}),
  theme: z
    .object({
      id: z.string().default(DEFAULT_THEME_ID),
      overrides: themeTokens.default({}),
    })
    .default({}),
  layout: z
    .object({
      width: z.number().min(240).max(4000).default(760),
      height: z.number().min(200).max(4000).default(480),
    })
    .default({}),
})

/** Identificador curto e legível, sem depender de `crypto.randomUUID`. */
export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function createDefaultSpec(overrides: Partial<ChartSpec> = {}): ChartSpec {
  const base = chartSpecSchema.parse({}) as ChartSpec
  return { ...base, ...overrides }
}

export interface ParseResult {
  ok: boolean
  spec: ChartSpec | null
  error: string | null
}

/**
 * Lê um arquivo salvo. Campos ausentes recebem o padrão, então versões
 * anteriores do formato continuam abrindo sem migração explícita.
 */
export function parseSpec(input: unknown): ParseResult {
  const raw = typeof input === 'string' ? safeJson(input) : input
  if (raw === undefined) {
    return { ok: false, spec: null, error: 'Arquivo não é um JSON válido.' }
  }

  const result = chartSpecSchema.safeParse(raw)
  if (!result.success) {
    const first = result.error.issues[0]
    return {
      ok: false,
      spec: null,
      error: `Campo "${first.path.join('.') || '(raiz)'}": ${first.message}`,
    }
  }
  return { ok: true, spec: result.data as ChartSpec, error: null }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export function serializeSpec(spec: ChartSpec): string {
  return JSON.stringify(spec, null, 2)
}
