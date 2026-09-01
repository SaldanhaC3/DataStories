/**
 * Parte-do-todo: rosca, waffle e treemap.
 *
 * Aqui as cores pertencem às categorias, não às séries — o gráfico tem uma
 * coluna de valor só. E aqui vale a regra editorial mais impopular: rosca com
 * muitas fatias é ilegível, e o linter vai dizer isso. O waffle existe
 * justamente para o caso "quero mostrar proporção sem usar pizza".
 */

import { arc as d3Arc } from 'd3-shape'
import {
  hierarchy,
  treemap as d3Treemap,
  treemapSquarify,
  type HierarchyRectangularNode,
} from 'd3-hierarchy'
import type { ChartSpec, SceneNode, Theme } from '../types'
import type { ChartModel } from '../model'
import type { ChartDefinition, DrawContext } from './context'
import { categorical } from '../theme/palettes'
import { contrastRatio, mix } from '../theme/contrast'
import { measureText } from '../text'
import { truncate } from '../format'

interface Slice {
  label: string
  value: number
  share: number
  color: string
  muted: boolean
  rowIndex: number
}

/** Uma fatia por categoria, já com cor, participação e estado de destaque. */
function slicesOf(model: ChartModel, spec: ChartSpec, theme: Theme): Slice[] {
  const series = model.series[0]
  if (!series) return []

  const highlighted = new Set(spec.highlight.categories)
  const hasHighlight = highlighted.size > 0
  const palette = categorical(theme.palette, model.categories.length)

  const raw = model.categoryLabels.map((label, i) => ({
    label,
    value: series.values[i] ?? 0,
    rowIndex: i,
  }))
  const total = raw.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1

  return raw
    .filter((s) => s.value > 0)
    .map((s, i) => {
      const muted = hasHighlight && !highlighted.has(s.label)
      return {
        ...s,
        share: s.value / total,
        color: muted ? theme.mutedSeries : spec.color.overrides[s.label] ?? palette[i],
        muted,
      }
    })
}

function readableOn(fill: string, fallback: string): string {
  if (contrastRatio('#ffffff', fill) >= 3.2) return '#ffffff'
  if (contrastRatio('#111111', fill) >= 3.2) return '#111111'
  return fallback
}

// ---------------------------------------------------------------------------
// Rosca
// ---------------------------------------------------------------------------

function drawDonut(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const slices = slicesOf(model, spec, theme)
  if (slices.length === 0) return []

  const { plot } = frame
  const cx = plot.x + plot.width / 2
  // Espaço à direita e à esquerda para os rótulos externos.
  const radius = Math.min(plot.width / 2 - 74, plot.height / 2 - 16)
  if (radius <= 10) return []
  const cy = plot.y + plot.height / 2
  const inner = radius * spec.chart.options.innerRadius

  const nodes: SceneNode[] = []
  // O gerador de arco do d3 desenha em torno da origem, entao os arcos vao
  // dentro de um grupo transladado. Os rotulos ficam fora dele, em coordenadas
  // absolutas, para nao terem de desfazer a translacao.
  const arcs: SceneNode[] = []
  const generator = d3Arc()
  let angle = 0

  for (const slice of slices) {
    const start = angle
    const end = angle + slice.share * Math.PI * 2
    angle = end

    const d = generator({
      innerRadius: inner,
      outerRadius: radius,
      startAngle: start,
      endAngle: end,
      padAngle: 0.004,
    })
    if (!d) continue

    arcs.push({
      t: 'path',
      d,
      fill: slice.color,
      stroke: theme.background,
      strokeWidth: 1.5,
      meta: {
        series: model.series[0]?.name ?? '',
        rowIndex: slice.rowIndex,
        category: slice.label,
        value: slice.value,
      },
    })

    // Fatias muito finas não comportam rótulo legível; o linter já avisa.
    if (slice.share < 0.03) continue

    const mid = (start + end) / 2 - Math.PI / 2
    const percent = `${(slice.share * 100).toFixed(slice.share < 0.1 ? 1 : 0)}%`

    if (slice.share > 0.09 && radius - inner > 34) {
      // Cabe dentro: rótulo interno é mais limpo que linha de chamada.
      const r = (inner + radius) / 2
      nodes.push({
        t: 'text',
        x: cx + Math.cos(mid) * r,
        y: cy + Math.sin(mid) * r,
        text: percent,
        fill: readableOn(slice.color, theme.background),
        size: theme.labelSize,
        weight: 700,
        family: theme.fontFamily,
        anchor: 'middle',
        baseline: 'middle',
      })
    }

    const outer = radius + 10
    const toRight = Math.cos(mid) >= 0
    const lx = cx + Math.cos(mid) * outer
    const ly = cy + Math.sin(mid) * outer

    nodes.push({
      t: 'text',
      x: lx + (toRight ? 4 : -4),
      y: ly,
      text: truncate(slice.label, 16),
      fill: slice.muted ? theme.muted : theme.foreground,
      size: theme.labelSize,
      weight: 600,
      family: theme.fontFamily,
      anchor: toRight ? 'start' : 'end',
      baseline: 'middle',
      halo: theme.background,
      haloWidth: 3,
    })
  }

  nodes.unshift({ t: 'g', children: arcs, transform: `translate(${cx},${cy})` })

  // O centro da rosca é espaço nobre: o total mora ali.
  if (inner > 26) {
    const total = slices.reduce((sum, s) => sum + s.value, 0)
    nodes.push(
      {
        t: 'text',
        x: cx,
        y: cy - 2,
        text: frame.formatDatum(total),
        fill: theme.foreground,
        size: Math.min(inner * 0.42, theme.titleSize),
        weight: 700,
        family: theme.titleFamily,
        anchor: 'middle',
        baseline: 'middle',
      },
      {
        t: 'text',
        x: cx,
        y: cy + Math.min(inner * 0.42, theme.titleSize) * 0.75,
        text: 'total',
        fill: theme.muted,
        size: theme.footerSize,
        family: theme.fontFamily,
        anchor: 'middle',
        baseline: 'middle',
      },
    )
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Waffle
// ---------------------------------------------------------------------------

function drawWaffle(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const slices = slicesOf(model, spec, theme)
  if (slices.length === 0) return []

  const total = spec.chart.options.waffleCells
  const columns = Math.round(Math.sqrt(total))
  const rows = Math.ceil(total / columns)

  const { plot } = frame
  // Legenda ocupa a faixa de baixo; o quadriculado fica no que sobra.
  const legendHeight = theme.labelSize * 2.2
  const gridHeight = plot.height - legendHeight
  const cell = Math.min(plot.width / columns, gridHeight / rows)
  const gap = Math.max(1.5, cell * 0.14)
  const gridWidth = cell * columns
  const originX = plot.x + (plot.width - gridWidth) / 2
  const originY = plot.y + Math.max(0, (gridHeight - cell * rows) / 2)

  // Reparte as células pelo maior resto, para o total bater exatamente.
  const exact = slices.map((s) => s.share * total)
  const counts = exact.map(Math.floor)
  let remaining = total - counts.reduce((a, b) => a + b, 0)
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
  for (const item of order) {
    if (remaining <= 0) break
    counts[item.i]++
    remaining--
  }

  const nodes: SceneNode[] = []
  let index = 0

  for (let s = 0; s < slices.length; s++) {
    for (let c = 0; c < counts[s]; c++) {
      // Preenche de baixo para cima, coluna a coluna: é como se lê um waffle.
      const column = Math.floor(index / rows)
      const row = rows - 1 - (index % rows)
      nodes.push({
        t: 'rect',
        x: originX + column * cell,
        y: originY + row * cell,
        w: cell - gap,
        h: cell - gap,
        rx: Math.min(2, cell * 0.12),
        fill: slices[s].color,
        meta: {
          series: model.series[0]?.name ?? '',
          rowIndex: slices[s].rowIndex,
          category: slices[s].label,
          value: slices[s].value,
        },
      })
      index++
    }
  }

  // Legenda inline: quadradinho + nome + porcentagem, em uma ou duas linhas.
  let lx = plot.x
  let ly = plot.y + gridHeight + theme.labelSize
  for (const slice of slices) {
    const text = `${truncate(slice.label, 18)} ${(slice.share * 100).toFixed(0)}%`
    const width = measureText(text, theme.labelSize, theme.fontFamily) + 26
    if (lx + width > plot.x + plot.width && lx > plot.x) {
      lx = plot.x
      ly += theme.labelSize * 1.5
    }
    nodes.push(
      {
        t: 'rect',
        x: lx,
        y: ly - theme.labelSize * 0.72,
        w: 10,
        h: 10,
        rx: 2,
        fill: slice.color,
      },
      {
        t: 'text',
        x: lx + 15,
        y: ly,
        text,
        fill: slice.muted ? theme.muted : theme.foreground,
        size: theme.labelSize,
        family: theme.fontFamily,
      },
    )
    lx += width
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Treemap
// ---------------------------------------------------------------------------

function drawTreemap(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const slices = slicesOf(model, spec, theme)
  if (slices.length === 0) return []

  const { plot } = frame
  // O treemap trabalha sobre uma arvore; aqui ela tem um nivel so, com as
  // fatias como folhas.
  type Node = { children?: Node[]; slice?: Slice }
  const root = hierarchy<Node>({ children: slices.map((slice) => ({ slice })) })
    .sum((d) => d.slice?.value ?? 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const laid = d3Treemap<Node>()
    .tile(treemapSquarify)
    .size([plot.width, plot.height])
    .paddingInner(2)(root) as HierarchyRectangularNode<Node>

  const nodes: SceneNode[] = []

  for (const leaf of laid.leaves()) {
    const slice = leaf.data.slice
    if (!slice) continue
    const x = plot.x + leaf.x0
    const y = plot.y + leaf.y0
    const w = leaf.x1 - leaf.x0
    const h = leaf.y1 - leaf.y0
    if (w < 1 || h < 1) continue

    nodes.push({
      t: 'rect',
      x,
      y,
      w,
      h,
      fill: slice.color,
      meta: {
        series: model.series[0]?.name ?? '',
        rowIndex: slice.rowIndex,
        category: slice.label,
        value: slice.value,
      },
    })

    const textColor = readableOn(slice.color, theme.background)
    const label = truncate(slice.label, Math.max(3, Math.floor(w / 7.2)))
    const labelWidth = measureText(label, theme.labelSize, theme.fontFamily, 700)

    // Só rotula quando o retângulo comporta o texto inteiro: rótulo cortado
    // é pior do que rótulo nenhum.
    if (w > labelWidth + 12 && h > theme.labelSize * 2.4) {
      nodes.push({
        t: 'text',
        x: x + 8,
        y: y + theme.labelSize + 6,
        text: label,
        fill: textColor,
        size: theme.labelSize,
        weight: 700,
        family: theme.fontFamily,
      })
      nodes.push({
        t: 'text',
        x: x + 8,
        y: y + theme.labelSize * 2.3 + 6,
        text: `${frame.formatDatum(slice.value)}  ·  ${(slice.share * 100).toFixed(0)}%`,
        fill: mix(textColor, slice.color, 0.25),
        size: theme.footerSize,
        family: theme.fontFamily,
      })
    }
  }

  return nodes
}

export const PARTITION_CHARTS: ChartDefinition[] = [
  {
    type: 'donut',
    label: 'Rosca',
    hint: 'Composição com poucas partes. Acima de 4 fatias, prefira waffle ou barras.',
    group: 'Distribuição e composição',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: true,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 1,
    draw: drawDonut,
  },
  {
    type: 'waffle',
    label: 'Waffle',
    hint: 'Proporção em células contáveis. Lê-se melhor que pizza.',
    group: 'Distribuição e composição',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: true,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 1,
    draw: drawWaffle,
  },
  {
    type: 'treemap',
    label: 'Treemap',
    hint: 'Composição com muitas partes de tamanhos muito diferentes.',
    group: 'Distribuição e composição',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: true,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 1,
    draw: drawTreemap,
  },
]
