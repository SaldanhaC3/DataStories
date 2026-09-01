/**
 * Gráficos de comparação: haltere, inclinação e bala.
 *
 * Os três respondem à mesma pergunta — "mudou quanto, e para que lado?" — e os
 * três existem porque uma barra agrupada responde mal a ela: o olho compara
 * comprimentos absolutos quando o assunto é a diferença entre eles.
 */

import type { SceneNode } from '../types'
import type { ChartDefinition, DrawContext } from './context'
import { measureText } from '../text'
import { truncate } from '../format'
import { fade, mix } from '../theme/contrast'
import { backdropOf } from '../theme/themes'
import { resolveVerticalCollisions, type LabelSlot } from '../annotate/collision'

// ---------------------------------------------------------------------------
// Haltere
// ---------------------------------------------------------------------------

function drawDumbbell(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const [first, second] = model.series
  if (!first || !second) return []

  const nodes: SceneNode[] = []
  const radius = spec.chart.options.pointRadius + 2.5

  for (let i = 0; i < model.categories.length; i++) {
    const a = first.values[i]
    const b = second.values[i]
    if (a === null || b === null) continue

    const center = frame.catPos(i)
    const pa = frame.xy(center, frame.valuePos(a))
    const pb = frame.xy(center, frame.valuePos(b))

    // A haste ganha a cor do ponto de chegada: é ela que conta a direção.
    const grew = b >= a
    const rodColor = second.muted && first.muted
      ? theme.mutedSeries
      : fade(grew ? second.color : first.color, 0.5, backdropOf(theme))

    nodes.push({
      t: 'line',
      x1: pa.x,
      y1: pa.y,
      x2: pb.x,
      y2: pb.y,
      stroke: rodColor,
      strokeWidth: 3,
      linecap: 'round',
    })
    nodes.push({
      t: 'circle',
      cx: pa.x,
      cy: pa.y,
      r: radius,
      fill: first.color,
      meta: { series: first.name, rowIndex: i, category: model.categoryLabels[i], value: a },
    })
    nodes.push({
      t: 'circle',
      cx: pb.x,
      cy: pb.y,
      r: radius,
      fill: second.color,
      meta: { series: second.name, rowIndex: i, category: model.categoryLabels[i], value: b },
    })

    if (spec.labels.valueLabels) {
      const delta = b - a
      const text = `${delta >= 0 ? '+' : '−'}${frame.formatDatum(Math.abs(delta))}`
      const width = measureText(text, theme.labelSize, theme.fontFamily, 600)
      const rightmost = Math.max(pa.x, pb.x)
      const leftmost = Math.min(pa.x, pb.x)
      // Halteres que chegam perto do fim da escala nao deixam espaco a direita;
      // nesse caso o delta vai para o lado de dentro, em vez de vazar do painel.
      const fitsRight =
        rightmost + radius + 7 + width <= frame.plot.x + frame.plot.width
      nodes.push({
        t: 'text',
        x: fitsRight ? rightmost + radius + 7 : leftmost - radius - 7,
        y: pa.y,
        text,
        fill: theme.muted,
        size: theme.labelSize,
        weight: 600,
        family: theme.fontFamily,
        anchor: fitsRight ? 'start' : 'end',
        baseline: 'middle',
      })
    }
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Inclinação
// ---------------------------------------------------------------------------

/**
 * Inclinacao.
 *
 * As duas colunas de rotulos sao o gargalo deste grafico: sao elas que dizem
 * quem e cada linha, e num conjunto real varias linhas chegam quase na mesma
 * altura. Por isso a largura reservada vem da medicao dos textos e as duas
 * colunas passam pelo mesmo anticolisao usado nos rotulos diretos.
 */
function drawSlope(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const [first, second] = model.series
  if (!first || !second) return []

  const nodes: SceneNode[] = []
  const { plot } = frame
  const size = theme.labelSize
  const font = theme.fontFamily

  interface Row {
    label: string
    a: number
    b: number
    color: string
    muted: boolean
    left: string
    right: string
    leftSlot: LabelSlot
    rightSlot: LabelSlot
  }

  const highlighted = new Set(spec.highlight.categories)
  const hasHighlight = highlighted.size > 0
  const palette = theme.palette
  const rows: Row[] = []

  for (let i = 0; i < model.categories.length; i++) {
    const a = first.values[i]
    const b = second.values[i]
    if (a === null || b === null) continue

    const label = truncate(model.categoryLabels[i], 18)
    const muted = hasHighlight && !highlighted.has(model.categoryLabels[i])
    const color = muted
      ? theme.mutedSeries
      : hasHighlight
        ? palette[[...highlighted].indexOf(model.categoryLabels[i]) % palette.length]
        : b >= a
          ? palette[0]
          : palette[1]

    const y1 = frame.valuePos(a)
    const y2 = frame.valuePos(b)

    rows.push({
      label,
      a,
      b,
      color,
      muted,
      left: spec.labels.valueLabels ? `${label}  ${frame.formatDatum(a)}` : label,
      right: spec.labels.valueLabels ? `${frame.formatDatum(b)}  ${label}` : label,
      leftSlot: { target: y1, height: size * 1.16, y: y1 },
      rightSlot: { target: y2, height: size * 1.16, y: y2 },
    })
  }

  if (rows.length === 0) return []

  const widest = Math.max(
    ...rows.map((r) => Math.max(measureText(r.left, size, font, 600), measureText(r.right, size, font, 600))),
  )
  // Nunca deixa as colunas comerem mais de 70% do painel: sobrando menos que
  // isso para as linhas, a inclinacao — que e o dado — some.
  const inset = Math.min(widest + 14, plot.width * 0.35)
  const x1 = plot.x + inset
  const x2 = plot.x + plot.width - inset

  const bounds = { top: plot.y - 2, bottom: plot.y + plot.height + 2 }
  resolveVerticalCollisions(rows.map((r) => r.leftSlot), bounds, 2)
  resolveVerticalCollisions(rows.map((r) => r.rightSlot), bounds, 2)

  nodes.push(
    {
      t: 'text',
      x: x1,
      y: plot.y - 12,
      text: first.name,
      fill: theme.foreground,
      size,
      weight: 700,
      family: font,
      anchor: 'middle',
    },
    {
      t: 'text',
      x: x2,
      y: plot.y - 12,
      text: second.name,
      fill: theme.foreground,
      size,
      weight: 700,
      family: font,
      anchor: 'middle',
    },
  )

  // Linhas primeiro, rotulos depois: um rotulo deslocado precisa ficar por cima.
  for (const row of [...rows].sort((a, b) => Number(b.muted) - Number(a.muted))) {
    const y1 = frame.valuePos(row.a)
    const y2 = frame.valuePos(row.b)
    nodes.push({
      t: 'line',
      x1,
      y1,
      x2,
      y2,
      stroke: row.color,
      strokeWidth: row.muted ? 1.2 : 2,
      opacity: row.muted ? 0.75 : 1,
    })
    nodes.push({ t: 'circle', cx: x1, cy: y1, r: row.muted ? 2.5 : 3.5, fill: row.color })
    nodes.push({ t: 'circle', cx: x2, cy: y2, r: row.muted ? 2.5 : 3.5, fill: row.color })
  }

  for (const row of rows) {
    nodes.push(
      {
        t: 'text',
        x: x1 - 9,
        y: row.leftSlot.y,
        text: row.left,
        fill: row.muted ? theme.muted : row.color,
        size,
        weight: row.muted ? 400 : 600,
        family: font,
        anchor: 'end',
        baseline: 'middle',
        halo: backdropOf(theme),
        haloWidth: 2.5,
      },
      {
        t: 'text',
        x: x2 + 9,
        y: row.rightSlot.y,
        text: row.right,
        fill: row.muted ? theme.muted : row.color,
        size,
        weight: row.muted ? 400 : 600,
        family: font,
        anchor: 'start',
        baseline: 'middle',
        halo: backdropOf(theme),
        haloWidth: 2.5,
      },
    )
  }

  return nodes
}

// ---------------------------------------------------------------------------
// Bala
// ---------------------------------------------------------------------------

function drawBullet(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const measure = model.series[0]
  if (!measure) return []

  // A meta é a segunda coluna numérica, ou a coluna apontada em `encoding.target`.
  const targetSeries =
    model.series.find((s) => s.name === spec.encoding.target) ?? model.series[1] ?? null

  const nodes: SceneNode[] = []
  const barHeight = Math.min(frame.band * 0.5, 22)
  const trackHeight = Math.min(frame.band * 0.86, 34)
  const baseline = frame.valuePos(Math.max(model.yDomain[0], Math.min(0, model.yDomain[1])))

  for (let i = 0; i < model.categories.length; i++) {
    const value = measure.values[i]
    if (value === null) continue
    const center = frame.catPos(i)

    // Trilha de fundo: mostra a escala inteira, dando contexto ao comprimento.
    nodes.push({
      t: 'rect',
      x: frame.plot.x,
      y: center - trackHeight / 2,
      w: frame.plot.width,
      h: trackHeight,
      fill: mix(backdropOf(theme), theme.foreground, 0.05),
    })

    const end = frame.valuePos(value)
    nodes.push({
      t: 'rect',
      x: Math.min(baseline, end),
      y: center - barHeight / 2,
      w: Math.abs(end - baseline),
      h: barHeight,
      fill: measure.color,
      meta: {
        series: measure.name,
        rowIndex: i,
        category: model.categoryLabels[i],
        value,
      },
    })

    const target = targetSeries?.values[i]
    if (target != null) {
      const tx = frame.valuePos(target)
      nodes.push({
        t: 'rect',
        x: tx - 1.5,
        y: center - trackHeight / 2 + 2,
        w: 3,
        h: trackHeight - 4,
        fill: theme.foreground,
      })
      // O rótulo da meta só aparece na primeira linha: repetido, vira ruído.
      // Perto da borda direita ele vira para dentro, senao vaza do painel.
      if (i === 0 && targetSeries) {
        const width = measureText(targetSeries.name, theme.footerSize, theme.fontFamily)
        const fitsRight = tx + 7 + width <= frame.plot.x + frame.plot.width
        nodes.push({
          t: 'text',
          x: fitsRight ? tx + 7 : tx - 7,
          y: center - trackHeight / 2 - 5,
          text: targetSeries.name,
          fill: theme.muted,
          size: theme.footerSize,
          family: theme.fontFamily,
          anchor: fitsRight ? 'start' : 'end',
        })
      }
    }

    if (spec.labels.valueLabels) {
      const text = frame.formatDatum(value)
      const width = measureText(text, theme.labelSize, theme.fontFamily, 700)
      const fits = Math.abs(end - baseline) > width + 16
      nodes.push({
        t: 'text',
        x: fits ? end - 8 : end + 8,
        y: center,
        text,
        fill: fits ? '#ffffff' : theme.foreground,
        size: theme.labelSize,
        weight: 700,
        family: theme.fontFamily,
        anchor: fits ? 'end' : 'start',
        baseline: 'middle',
      })
    }
  }

  return nodes
}

export const COMPARISON_CHARTS: ChartDefinition[] = [
  {
    type: 'dumbbell',
    label: 'Haltere',
    hint: 'Dois momentos, muitas categorias. Mostra a diferença, não só os níveis.',
    group: 'Comparação e ranking',
    orientation: 'horizontal',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 2,
    draw: drawDumbbell,
  },
  {
    type: 'slope',
    label: 'Inclinação',
    hint: 'Antes e depois: a inclinação de cada linha é a própria história.',
    group: 'Comparação e ranking',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 2,
    suppressCategoryAxis: true,
    suppressLegend: true,
    draw: drawSlope,
  },
  {
    type: 'bullet',
    label: 'Bala',
    hint: 'Realizado contra meta. Substitui o velocímetro em painéis.',
    group: 'Comparação e ranking',
    orientation: 'horizontal',
    categoryKind: () => 'band',
    bare: false,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: 2,
    suppressLegend: true,
    draw: drawBullet,
  },
]
