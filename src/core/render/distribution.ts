/**
 * Distribuição: histograma e boxplot.
 *
 * Os dois reescrevem o modelo antes de desenhar, porque suas categorias não são
 * as linhas da tabela: no histograma são faixas calculadas, no boxplot são as
 * próprias colunas. É para isso que existe `transformModel`.
 */

import type { SceneNode } from '../types'
import type { ChartModel } from '../model'
import { flatValues } from '../model'
import type { ChartDefinition, DrawContext } from './context'
import { formatNumber } from '../format'
import { mix } from '../theme/contrast'

// ---------------------------------------------------------------------------
// Histograma
// ---------------------------------------------------------------------------

/**
 * Regra de Freedman–Diaconis para a largura da faixa. É mais robusta que a de
 * Sturges quando há valores extremos, que é o caso comum em dados reais.
 */
function freedmanDiaconisBins(values: number[]): number {
  if (values.length < 4) return Math.max(1, values.length)
  const sorted = [...values].sort((a, b) => a - b)
  const q = (p: number) => {
    const pos = (sorted.length - 1) * p
    const lo = Math.floor(pos)
    const hi = Math.ceil(pos)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
  }
  const iqr = q(0.75) - q(0.25)
  const span = sorted[sorted.length - 1] - sorted[0]
  if (iqr <= 0 || span <= 0) return Math.ceil(Math.sqrt(values.length))
  const width = (2 * iqr) / Math.cbrt(values.length)
  return Math.max(1, Math.min(60, Math.ceil(span / width)))
}

function histogramModel(model: ChartModel, spec: import('../types').ChartSpec): ChartModel {
  const values = flatValues(model)
  if (values.length === 0) return model

  const count = spec.chart.options.bins ?? freedmanDiaconisBins(values)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const width = (max - min) / count || 1

  const counts = new Array(count).fill(0)
  for (const v of values) {
    const index = Math.min(count - 1, Math.floor((v - min) / width))
    counts[index]++
  }

  const locale = spec.data.locale
  const labels = counts.map((_, i) => {
    const lo = min + i * width
    const hi = lo + width
    const decimals = width < 1 ? 2 : 0
    return `${formatNumber(lo, `,.${decimals}f`, locale)}–${formatNumber(hi, `,.${decimals}f`, locale)}`
  })

  const color = model.series[0]?.color ?? '#1A6BA8'

  return {
    ...model,
    categories: labels,
    categoryLabels: labels,
    xType: 'category',
    series: [
      {
        name: 'Frequência',
        color,
        muted: false,
        values: counts,
        rowIndexes: counts.map((_, i) => i),
      },
    ],
    yDomain: [0, Math.max(...counts) * 1.05 || 1],
    stacked: false,
    normalized: false,
    extra: { binWidth: width, min, max },
  }
}

function drawHistogram(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const series = model.series[0]
  if (!series) return []

  const nodes: SceneNode[] = []
  const baseline = frame.valuePos(0)

  for (let i = 0; i < series.values.length; i++) {
    const value = series.values[i]
    if (value === null) continue
    const top = frame.valuePos(value)
    const center = frame.catPos(i)

    nodes.push({
      t: 'rect',
      x: center - frame.band / 2,
      y: Math.min(top, baseline),
      w: Math.max(1, frame.band),
      h: Math.abs(baseline - top),
      fill: series.color,
      meta: {
        series: series.name,
        rowIndex: i,
        category: model.categoryLabels[i],
        value,
      },
    })

    if (spec.labels.valueLabels && value > 0) {
      nodes.push({
        t: 'text',
        x: center,
        y: top - 5,
        text: frame.formatDatum(value),
        fill: theme.muted,
        size: theme.footerSize,
        family: theme.fontFamily,
        anchor: 'middle',
      })
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Boxplot
// ---------------------------------------------------------------------------

export interface BoxStats {
  name: string
  color: string
  muted: boolean
  min: number
  q1: number
  median: number
  q3: number
  max: number
  outliers: number[]
}

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const pos = (sorted.length - 1) * p
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

function boxplotModel(model: ChartModel): ChartModel {
  const boxes: BoxStats[] = []

  for (const series of model.series) {
    const values = series.values.filter((v): v is number => v !== null)
    if (values.length === 0) continue
    const sorted = [...values].sort((a, b) => a - b)

    const q1 = quantile(sorted, 0.25)
    const median = quantile(sorted, 0.5)
    const q3 = quantile(sorted, 0.75)
    const iqr = q3 - q1
    // Bigodes de Tukey: até 1,5×IQR, e nunca além do dado real.
    const lowFence = q1 - 1.5 * iqr
    const highFence = q3 + 1.5 * iqr
    const inRange = sorted.filter((v) => v >= lowFence && v <= highFence)

    boxes.push({
      name: series.name,
      color: series.color,
      muted: series.muted,
      min: inRange.length ? inRange[0] : sorted[0],
      q1,
      median,
      q3,
      max: inRange.length ? inRange[inRange.length - 1] : sorted[sorted.length - 1],
      outliers: sorted.filter((v) => v < lowFence || v > highFence),
    })
  }

  if (boxes.length === 0) return model

  const all = boxes.flatMap((b) => [b.min, b.max, ...b.outliers])
  const min = Math.min(...all)
  const max = Math.max(...all)
  const pad = (max - min) * 0.06 || 1

  return {
    ...model,
    categories: boxes.map((b) => b.name),
    categoryLabels: boxes.map((b) => b.name),
    xType: 'category',
    series: [
      {
        name: 'Mediana',
        color: boxes[0].color,
        muted: false,
        values: boxes.map((b) => b.median),
        rowIndexes: boxes.map((_, i) => i),
      },
    ],
    yDomain: [min - pad, max + pad],
    stacked: false,
    normalized: false,
    extra: { boxes },
  }
}

function drawBoxplot(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme } = ctx
  const boxes = (model.extra?.boxes as BoxStats[] | undefined) ?? []
  if (boxes.length === 0) return []

  const nodes: SceneNode[] = []
  const boxWidth = Math.min(frame.band * 0.62, 56)

  boxes.forEach((box, i) => {
    const center = frame.catPos(i)
    const yMax = frame.valuePos(box.max)
    const yMin = frame.valuePos(box.min)
    const yQ1 = frame.valuePos(box.q1)
    const yQ3 = frame.valuePos(box.q3)
    const yMedian = frame.valuePos(box.median)
    const half = boxWidth / 2

    // Bigodes
    nodes.push(
      { t: 'line', x1: center, y1: yMax, x2: center, y2: yQ3, stroke: theme.axis, strokeWidth: 1 },
      { t: 'line', x1: center, y1: yQ1, x2: center, y2: yMin, stroke: theme.axis, strokeWidth: 1 },
      { t: 'line', x1: center - half * 0.45, y1: yMax, x2: center + half * 0.45, y2: yMax, stroke: theme.axis, strokeWidth: 1 },
      { t: 'line', x1: center - half * 0.45, y1: yMin, x2: center + half * 0.45, y2: yMin, stroke: theme.axis, strokeWidth: 1 },
    )

    // Caixa: preenchimento claro para a mediana ficar legível por cima.
    nodes.push({
      t: 'rect',
      x: center - half,
      y: Math.min(yQ1, yQ3),
      w: boxWidth,
      h: Math.abs(yQ1 - yQ3),
      fill: mix(theme.background, box.color, 0.55),
      stroke: box.color,
      strokeWidth: 1,
      meta: {
        series: box.name,
        rowIndex: i,
        category: box.name,
        value: box.median,
      },
    })

    nodes.push({
      t: 'line',
      x1: center - half,
      y1: yMedian,
      x2: center + half,
      y2: yMedian,
      stroke: box.muted ? theme.muted : theme.foreground,
      strokeWidth: 2,
    })

    for (const outlier of box.outliers) {
      nodes.push({
        t: 'circle',
        cx: center,
        cy: frame.valuePos(outlier),
        r: 2.5,
        fill: box.color,
        opacity: 0.65,
      })
    }
  })

  return nodes
}

export const DISTRIBUTION_CHARTS: ChartDefinition[] = [
  {
    type: 'histogram',
    label: 'Histograma',
    hint: 'Como os valores de uma variável se distribuem.',
    group: 'Distribuição e composição',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 1,
    transformModel: histogramModel,
    draw: drawHistogram,
  },
  {
    type: 'boxplot',
    label: 'Boxplot',
    hint: 'Compara a dispersão de várias variáveis lado a lado.',
    group: 'Distribuição e composição',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: Infinity,
    transformModel: (model) => boxplotModel(model),
    draw: drawBoxplot,
  },
]
