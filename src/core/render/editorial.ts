/**
 * Gráficos de ênfase editorial: cascata e número grande.
 *
 * Os dois respondem perguntas de abertura de matéria — "como chegamos nesse
 * total?" e "qual é o número que resume tudo?" — e por isso desenham menos
 * chrome, não mais: a tinta toda vai na mensagem.
 *
 * A cor de queda da cascata é deliberadamente fixa (#C64B3F): é um vermelho
 * de semáforo que mantém contraste tanto no fundo branco quanto no escuro,
 * porque significar "caiu" não pode depender do tema.
 */

import type { SceneNode } from '../types'
import type { ChartModel } from '../model'
import type { DrawContext } from './context'
import { bandOrTime } from './context'
import type { ChartDefinition } from './context'
import { valueLabelNode } from '../annotate/directLabels'
import { backdropOf } from '../theme/themes'
import { formatNumber } from '../format'
import { measureText } from '../text'

const DOWN = '#C64B3F'

// ---------------------------------------------------------------------------
// Cascata
// ---------------------------------------------------------------------------

/**
 * Converte a série de variações em segmentos flutuantes: `values` continua
 * sendo o delta lido na tabela, `bases` carrega o acumulado anterior. O
 * domínio é recalculado por cima dos acumulados, senão a escala só cobriria
 * as variações e as barras vazariam do painel.
 */
function waterfallModel(model: ChartModel): ChartModel {
  const series = model.series[0]
  if (!series) return model

  const bases: number[] = []
  let running = 0
  for (const value of series.values) {
    if (value === null) {
      bases.push(running)
      continue
    }
    bases.push(running)
    running += value
  }

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < series.values.length; i++) {
    const value = series.values[i]
    if (value === null) continue
    min = Math.min(min, bases[i], bases[i] + value)
    max = Math.max(max, bases[i], bases[i] + value)
  }
  if (min === Infinity) {
    min = 0
    max = 1
  }
  min = Math.min(min, 0)
  max = Math.max(max, 0)

  return {
    ...model,
    stacked: true,
    yDomain: [min, max],
    series: [{ ...series, values: [...series.values], bases }],
  }
}

function drawWaterfall(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const series = model.series[0]
  if (!series) return []

  const nodes: SceneNode[] = []
  const vertical = frame.orientation === 'vertical'

  let previousTop: { x: number; y: number } | null = null

  for (let i = 0; i < series.values.length; i++) {
    const value = series.values[i]
    if (value === null) continue
    const base = series.bases![i]

    const from = frame.valuePos(base)
    const to = frame.valuePos(base + value)
    const lo = Math.min(from, to)
    const hi = Math.max(from, to)
    const center = frame.catPos(i)
    const catStart = center - frame.band / 2

    const up = value >= 0
    const fill = up ? theme.accent : DOWN

    // A ponta da barra que carrega a variação: é dela que o conector parte.
    const topPixel = up ? to : from

    const rect = vertical
      ? { t: 'rect' as const, x: catStart, y: lo, w: frame.band, h: Math.max(0.5, hi - lo), fill }
      : { t: 'rect' as const, x: lo, y: catStart, w: Math.max(0.5, hi - lo), h: frame.band, fill }

    nodes.push({
      ...rect,
      meta: { series: series.name, rowIndex: i, category: model.categoryLabels[i], value },
    })

    // Conector tracejado entre barras vizinhas: é ele que faz o olho seguir o
    // fio do raciocínio contábil de uma barra para a outra.
    if (previousTop) {
      nodes.push(
        vertical
          ? {
              t: 'line',
              x1: previousTop.x,
              y1: previousTop.y,
              x2: catStart,
              y2: topPixel,
              stroke: theme.axis,
              strokeWidth: 1,
              dash: '2 3',
            }
          : {
              t: 'line',
              x1: previousTop.x,
              y1: previousTop.y,
              x2: topPixel,
              y2: catStart,
              stroke: theme.axis,
              strokeWidth: 1,
              dash: '2 3',
            },
      )
    }
    previousTop = vertical
      ? { x: catStart + frame.band, y: topPixel }
      : { x: topPixel, y: catStart + frame.band }

    if (spec.labels.valueLabels) {
      const signed = `${up ? '+' : '−'}${frame.formatDatum(Math.abs(value))}`
      nodes.push(
        valueLabelNode(
          signed,
          from,
          to,
          center,
          frame.orientation,
          fill,
          { background: backdropOf(theme), size: theme.labelSize, family: theme.fontFamily },
        ),
      )
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Número grande
// ---------------------------------------------------------------------------

function drawBigNumber(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec, locale } = ctx
  const series = model.series[0]
  if (!series) return []

  const nodes: SceneNode[] = []
  const { plot } = frame

  // O número em destaque é o último valor definido: em séries temporais é o
  // "onde estamos agora", que é a pergunta que o número grande responde.
  let index = -1
  for (let i = series.values.length - 1; i >= 0; i--) {
    if (series.values[i] !== null) {
      index = i
      break
    }
  }
  if (index < 0) return []
  const value = series.values[index] as number

  const format = spec.labels.valueFormat
  const places = format?.decimals ?? (Number.isInteger(value) ? 0 : 2)
  const mark = format && !format.group ? '' : ','
  const numberText = `${format?.prefix ?? ''}${formatNumber(
    value,
    `${mark}.${places}f`,
    locale,
  )}${format?.suffix ?? ''}`

  // O tamanho nasce do texto medido, não de uma régua fixa: o mesmo valor em
  // "1,2 mi" e "1.234.567" precisa de corpos muito diferentes.
  let size = theme.titleSize * 3.2
  const maxWidth = plot.width * 0.94
  while (size > theme.titleSize && measureText(numberText, size, theme.titleFamily, 700) > maxWidth) {
    size -= 2
  }

  const cy = plot.y + plot.height * 0.34

  nodes.push({
    t: 'text',
    x: plot.x,
    y: cy,
    text: numberText,
    fill: theme.foreground,
    size,
    weight: 700,
    family: theme.titleFamily,
  })

  // Linha de contexto: categoria do número, e a variação contra o valor
  // anterior quando existe — o "+X% contra [anterior]" é o que transforma o
  // número em notícia.
  const contextParts: string[] = [model.categoryLabels[index] ?? series.name]
  const prev = index > 0 ? series.values[index - 1] : null
  if (prev !== null && prev !== 0 && Number.isFinite(prev)) {
    const change = (value - prev) / Math.abs(prev)
    contextParts[0] = `${model.categoryLabels[index] ?? series.name}  ·  ${
      change >= 0 ? '+' : '−'
    }${formatNumber(Math.abs(change), '.0%', locale)} vs. ${
      model.categoryLabels[index - 1] ?? 'anterior'
    }`
  }
  nodes.push({
    t: 'text',
    x: plot.x,
    y: cy + theme.subtitleSize * 2.2,
    text: contextParts[0],
    fill: theme.muted,
    size: theme.subtitleSize,
    family: theme.fontFamily,
  })

  // Minigráfico da série inteira, a tinta mais leve possível: sem eixo, sem
  // grade, só a silhueta que dá ao número um passado.
  const defined = series.values
    .map((v, i) => ({ v, i }))
    .filter((d): d is { v: number; i: number } => d.v !== null)
  if (defined.length >= 3) {
    const values = defined.map((d) => d.v as number)
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const span = hi - lo || 1
    const sparkY = plot.y + plot.height * 0.72
    const sparkH = Math.min(plot.height * 0.2, 64)
    const px = (i: number) => plot.x + (i / (defined.length - 1)) * plot.width
    const py = (v: number) => sparkY + sparkH - ((v - lo) / span) * sparkH

    const points = defined.map((d) => `${px(d.i)},${py(d.v as number)}`)
    nodes.push({
      t: 'path',
      d: `M${points.join('L')}`,
      stroke: theme.accent,
      strokeWidth: 2,
      fill: 'none',
      linecap: 'round',
      linejoin: 'round',
      opacity: 0.85,
    })
    nodes.push({
      t: 'circle',
      cx: px(defined[defined.length - 1].i),
      cy: py(values[values.length - 1]),
      r: 3.5,
      fill: theme.accent,
    })
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Definições
// ---------------------------------------------------------------------------

export const EDITORIAL_CHARTS: ChartDefinition[] = [
  {
    type: 'waterfall',
    label: 'Cascata',
    hint: 'Decompor um total em variações: o que somou e o que subtraiu.',
    group: 'Núcleo editorial',
    orientation: 'vertical',
    categoryKind: bandOrTime,
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 1,
    transformModel: waterfallModel,
    draw: drawWaterfall,
  },
  {
    type: 'big-number',
    label: 'Número grande',
    hint: 'Um único número em destaque, com contexto e minigráfico da série.',
    group: 'Núcleo editorial',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: true,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 1,
    suppressLegend: true,
    suppressCategoryAxis: true,
    draw: drawBigNumber,
  },
]
