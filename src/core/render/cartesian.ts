/**
 * Gráficos cartesianos: barras, linhas, área, dispersão e pirulito.
 *
 * Detalhes que parecem pequenos e não são:
 * - séries apagadas são desenhadas antes das destacadas, para o destaque ficar
 *   por cima;
 * - lacunas (`null`) interrompem a linha em vez de serem interpoladas, senão o
 *   gráfico inventa dado que não existe;
 * - barras têm um filete de 1px da cor do fundo entre segmentos empilhados, o
 *   que separa as fatias sem precisar de borda;
 * - pontos de linha só aparecem quando há espaço para eles não virarem ruído.
 */

import { area as d3Area, curveLinear, curveMonotoneX, curveStepAfter, line as d3Line } from 'd3-shape'
import type { SceneNode } from '../types'
import type { DrawContext } from './context'
import { bandOrTime, drawOrder, markColor, markMuted } from './context'
import type { ChartDefinition } from './context'
import { valueLabelNode } from '../annotate/directLabels'

function curveOf(mode: string) {
  if (mode === 'smooth') return curveMonotoneX
  if (mode === 'step') return curveStepAfter
  return curveLinear
}

// ---------------------------------------------------------------------------
// Barras
// ---------------------------------------------------------------------------

function drawBars(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const nodes: SceneNode[] = []
  const vertical = frame.orientation === 'vertical'
  const series = model.series
  const grouped = !model.stacked && series.length > 1
  const subBand = grouped ? frame.band / series.length : frame.band
  const baselinePixel = frame.valuePos(Math.max(model.yDomain[0], Math.min(0, model.yDomain[1])))

  for (const s of drawOrder(series)) {
    const slot = series.indexOf(s)
    for (let i = 0; i < s.values.length; i++) {
      const value = s.values[i]
      if (value === null) continue

      const base = s.bases ? s.bases[i] : 0
      const from = model.stacked ? frame.valuePos(base) : baselinePixel
      const to = frame.valuePos(base + value)

      const center = frame.catPos(i)
      const catStart = grouped
        ? center - frame.band / 2 + slot * subBand
        : center - frame.band / 2

      // O filete entre fatias empilhadas: 1px comido do topo de cada segmento.
      const shave = model.stacked && Math.abs(to - from) > 3 ? 1 : 0
      const lo = Math.min(from, to)
      const hi = Math.max(from, to)

      const fill = markColor(ctx, s, i)
      const rect = vertical
        ? {
            t: 'rect' as const,
            x: catStart,
            y: lo + (to < from ? shave : 0),
            w: subBand,
            h: Math.max(0.5, hi - lo - shave),
            fill,
          }
        : {
            t: 'rect' as const,
            x: lo + (to < from ? 0 : shave),
            y: catStart,
            w: Math.max(0.5, hi - lo - shave),
            h: subBand,
            fill,
          }

      nodes.push({
        ...rect,
        meta: {
          series: s.name,
          rowIndex: i,
          category: model.categoryLabels[i],
          value,
        },
      })

      if (spec.labels.valueLabels && !markMuted(ctx, s, i)) {
        nodes.push(
          valueLabelNode(
            frame.formatDatum(value),
            from,
            to,
            catStart + subBand / 2,
            frame.orientation,
            fill,
            { background: theme.background, size: theme.labelSize, family: theme.fontFamily },
          ),
        )
      }
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Linha e área
// ---------------------------------------------------------------------------

function pointsOf(ctx: DrawContext, s: (typeof ctx.model.series)[number]) {
  return s.values.map((value, i) => ({
    i,
    value,
    defined: value !== null,
    cat: ctx.frame.catPos(i),
    val: value === null ? 0 : ctx.frame.valuePos((s.bases ? s.bases[i] : 0) + value),
    base: ctx.frame.valuePos(s.bases ? s.bases[i] : 0),
  }))
}

function drawLines(ctx: DrawContext, filled: boolean): SceneNode[] {
  const { model, frame, spec, theme } = ctx
  const nodes: SceneNode[] = []
  const vertical = frame.orientation === 'vertical'
  const curve = curveOf(spec.chart.options.curve)
  const width = spec.chart.options.strokeWidth

  for (const s of drawOrder(model.series)) {
    const points = pointsOf(ctx, s)

    if (filled) {
      const generator = d3Area<(typeof points)[number]>()
        .defined((p) => p.defined)
        .x((p) => (vertical ? p.cat : p.val))
        .y((p) => (vertical ? p.val : p.cat))
        .x1((p) => (vertical ? p.cat : p.val))
        .y1((p) => (vertical ? p.val : p.cat))
        .x0((p) => (vertical ? p.cat : model.stacked ? p.base : frame.valuePos(Math.max(0, model.yDomain[0]))))
        .y0((p) => (vertical ? (model.stacked ? p.base : frame.valuePos(Math.max(0, model.yDomain[0]))) : p.cat))
        .curve(curve)

      const d = generator(points)
      if (d) {
        // Empilhado, cada faixa e opaca porque nao ha sobreposicao. Solto, as
        // areas se cruzam: transparencia de verdade e o que deixa a serie de
        // tras continuar visivel — achatar a cor contra o fundo a esconderia.
        nodes.push(
          model.stacked
            ? { t: 'path', d, fill: s.color }
            : { t: 'path', d, fill: s.color, opacity: spec.chart.options.fillOpacity },
        )
      }
    }

    const generator = d3Line<(typeof points)[number]>()
      .defined((p) => p.defined)
      .x((p) => (vertical ? p.cat : p.val))
      .y((p) => (vertical ? p.val : p.cat))
      .curve(curve)

    const d = generator(points)
    if (d) {
      nodes.push({
        t: 'path',
        d,
        stroke: s.color,
        strokeWidth: filled && model.stacked ? Math.max(1, width - 0.5) : width,
        fill: 'none',
        linecap: 'round',
        linejoin: 'round',
        // O rastro na linha inteira permite hover/clique mesmo sem marcadores
        // de ponto; o valor fica como NaN para o tooltip não imprimir número
        // errado (o ponto mais próximo mostra o valor certo).
        meta: {
          series: s.name,
          rowIndex: -1,
          category: '',
          value: Number.NaN,
        },
      })
    }

    // Pontos só quando não viram ruído: até um marcador a cada 14px.
    const defined = points.filter((p) => p.defined)
    const density = frame.plot.width / Math.max(1, defined.length)
    const showPoints = spec.chart.options.showPoints && density > 14
    const singleton = defined.length === 1

    // Alvos de toque invisíveis: sem eles, uma linha fina é difícil de hover e
    // o tooltip não tem onde ler o valor do ponto. O handle "hit" faz a
    // exportação em SVG/PNG descartá-los — são só para a interação do editor.
    if (!showPoints && !singleton) {
      for (const p of defined) {
        const { x, y } = frame.xy(p.cat, p.val)
        nodes.push({
          t: 'circle',
          cx: x,
          cy: y,
          r: Math.max(11, width * 3),
          fill: 'transparent',
          handle: 'hit',
          meta: {
            series: s.name,
            rowIndex: p.i,
            category: model.categoryLabels[p.i],
            value: p.value ?? 0,
          },
        })
      }
    }

    if (showPoints || singleton) {
      for (const p of defined) {
        nodes.push({
          t: 'circle',
          cx: vertical ? p.cat : p.val,
          cy: vertical ? p.val : p.cat,
          r: spec.chart.options.pointRadius,
          fill: s.color,
          stroke: theme.background,
          strokeWidth: 1.5,
          meta: {
            series: s.name,
            rowIndex: p.i,
            category: model.categoryLabels[p.i],
            value: p.value ?? 0,
          },
        })
      }
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Dispersão
// ---------------------------------------------------------------------------

function drawScatter(ctx: DrawContext): SceneNode[] {
  const { model, frame, spec } = ctx
  const nodes: SceneNode[] = []
  const radius = spec.chart.options.pointRadius + 1.5

  for (const s of drawOrder(model.series)) {
    for (let i = 0; i < s.values.length; i++) {
      const value = s.values[i]
      if (value === null) continue
      const { x, y } = frame.xy(frame.catPos(i), frame.valuePos(value))
      nodes.push({
        t: 'circle',
        cx: x,
        cy: y,
        r: radius,
        fill: markColor(ctx, s, i),
        opacity: markMuted(ctx, s, i) ? 0.65 : 0.82,
        meta: {
          series: s.name,
          rowIndex: i,
          category: model.categoryLabels[i],
          value,
        },
      })
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Pirulito
// ---------------------------------------------------------------------------

function drawLollipop(ctx: DrawContext): SceneNode[] {
  const { model, frame, spec, theme } = ctx
  const nodes: SceneNode[] = []
  const baseline = frame.valuePos(Math.max(model.yDomain[0], Math.min(0, model.yDomain[1])))
  const series = model.series
  const subBand = series.length > 1 ? frame.band / series.length : frame.band

  for (const s of drawOrder(series)) {
    const slot = series.indexOf(s)
    for (let i = 0; i < s.values.length; i++) {
      const value = s.values[i]
      if (value === null) continue

      const center =
        series.length > 1
          ? frame.catPos(i) - frame.band / 2 + slot * subBand + subBand / 2
          : frame.catPos(i)
      const tip = frame.valuePos(value)

      const a = frame.xy(center, baseline)
      const b = frame.xy(center, tip)

      const color = markColor(ctx, s, i)
      nodes.push({
        t: 'line',
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: color,
        strokeWidth: 2,
        linecap: 'round',
        opacity: markMuted(ctx, s, i) ? 0.8 : 1,
      })
      nodes.push({
        t: 'circle',
        cx: b.x,
        cy: b.y,
        r: spec.chart.options.pointRadius + 2,
        fill: color,
        meta: {
          series: s.name,
          rowIndex: i,
          category: model.categoryLabels[i],
          value,
        },
      })

      if (spec.labels.valueLabels) {
        nodes.push(
          valueLabelNode(
            frame.formatDatum(value),
            baseline,
            tip,
            center,
            frame.orientation,
            color,
            {
              background: theme.background,
              size: theme.labelSize,
              family: theme.fontFamily,
              offset: spec.chart.options.pointRadius + 8,
            },
          ),
        )
      }
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Definições
// ---------------------------------------------------------------------------

export const CARTESIAN_CHARTS: ChartDefinition[] = [
  {
    type: 'bar',
    label: 'Barras verticais',
    hint: 'Comparar poucas categorias, ou uma série curta no tempo.',
    group: 'Núcleo editorial',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: true,
    seriesLimit: Infinity,
    draw: drawBars,
  },
  {
    type: 'bar-horizontal',
    label: 'Barras horizontais',
    hint: 'Rankings e categorias com nome comprido. Quase sempre melhor que vertical.',
    group: 'Núcleo editorial',
    orientation: 'horizontal',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: true,
    seriesLimit: Infinity,
    draw: drawBars,
  },
  {
    type: 'line',
    label: 'Linhas',
    hint: 'Evolução no tempo. Aceita muitas séries se você destacar uma.',
    group: 'Núcleo editorial',
    orientation: 'vertical',
    categoryKind: bandOrTime,
    bare: false,
    supportsDirectLabels: true,
    supportsStacking: false,
    seriesLimit: Infinity,
    draw: (ctx) => drawLines(ctx, false),
  },
  {
    type: 'area',
    label: 'Área',
    hint: 'Volume acumulado no tempo. Empilhada, mostra composição.',
    group: 'Núcleo editorial',
    orientation: 'vertical',
    categoryKind: bandOrTime,
    bare: false,
    supportsDirectLabels: true,
    supportsStacking: true,
    seriesLimit: Infinity,
    draw: (ctx) => drawLines(ctx, true),
  },
  {
    type: 'scatter',
    label: 'Dispersão',
    hint: 'Relação entre duas variáveis numéricas.',
    group: 'Núcleo editorial',
    orientation: 'vertical',
    categoryKind: (model) => (model.xType === 'date' ? 'time' : 'linear'),
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: Infinity,
    draw: drawScatter,
  },
  {
    type: 'lollipop',
    label: 'Pirulito',
    hint: 'Ranking com muitas categorias: menos tinta que barras.',
    group: 'Comparação e ranking',
    orientation: 'horizontal',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: Infinity,
    draw: drawLollipop,
  },
]
