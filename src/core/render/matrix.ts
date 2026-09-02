/**
 * Mapa de calor: duas categorias cruzadas, valor vira cor.
 *
 * A matriz é montada sem inventar estrutura: linhas da tabela viram linhas da
 * matriz, cada coluna numérica vira uma coluna da matriz. A cor vem da rampa
 * sequencial do tema — ou da divergente quando o domínio cruza o zero, porque
 * com negativos o "mais" e o "menos" precisam de lados visuais opostos.
 *
 * Células sem valor não são pintadas: célula vazia é informação (dado
 * ausente), e pintá-la de qualquer cor seria inventar leitura.
 */

import type { SceneNode, Theme } from '../types'
import type { ChartModel } from '../model'
import { sampleRamp } from '../theme/palettes'
import { contrastRatio } from '../theme/contrast'
import { measureText } from '../text'
import { truncate } from '../format'
import type { DrawContext } from './context'
import type { ChartDefinition } from './context'

const ROW_LABEL_CHARS = 16
const GAP = 1

/** Largura dos rótulos de linha, medida — é a margem esquerda do quadro. */
function heatmapReserveLeft(model: ChartModel, _spec: unknown, theme: Theme): number {
  if (model.categories.length === 0) return 0
  const labels = model.categoryLabels.map((l) => truncate(l, ROW_LABEL_CHARS))
  const widest = Math.max(...labels.map((l) => measureText(l, theme.labelSize, theme.fontFamily)))
  return Math.min(widest + 10, 180)
}

/**
 * Cor de uma célula. A rampa é amostrada uma vez por render com passos finos e
 * indexada pela posição normalizada do valor — interpolar por célula custaria
 * medições de cor redundantes para a mesma rampa.
 */
function colorScale(
  min: number,
  max: number,
  theme: Theme,
): (value: number) => string {
  const crosses = min < 0 && max > 0
  const ramp = crosses ? theme.diverging : theme.sequential
  const lo = crosses ? -Math.max(-min, max) : min
  const hi = crosses ? Math.max(-min, max) : max
  const span = hi - lo || 1
  const steps = sampleRamp(ramp, 64)
  return (value: number) => {
    const t = Math.max(0, Math.min(1, (value - lo) / span))
    return steps[Math.round(t * (steps.length - 1))]
  }
}

function readableOn(fill: string, fallback: string): string {
  if (contrastRatio('#ffffff', fill) >= 3) return '#ffffff'
  if (contrastRatio('#111111', fill) >= 3) return '#111111'
  return fallback
}

function drawHeatmap(ctx: DrawContext): SceneNode[] {
  const { model, frame, theme, spec } = ctx
  const { plot } = frame
  const nodes: SceneNode[] = []

  const rows = model.categories.length
  const cols = model.series.length
  if (rows === 0 || cols === 0) return []

  let min = Infinity
  let max = -Infinity
  for (const s of model.series) {
    for (const v of s.values) {
      if (v === null || !Number.isFinite(v)) continue
      min = Math.min(min, v)
      max = Math.max(max, v)
    }
  }
  if (min === Infinity) return []
  if (min === max) {
    // Um valor só: tudo na mesma cor. A escala continuaria funcionando, mas
    // com span 0 qualquer toque de arredondamento espalharia cores falsas.
    min -= 0.5
    max += 0.5
  }

  const color = colorScale(min, max, theme)

  const cellW = plot.width / cols
  const cellH = plot.height / rows
  const labelFits = spec.labels.valueLabels && cellW >= 34 && cellH >= 18

  // Rótulos de coluna no topo, só quando a coluna é larga o bastante para o
  // texto truncado caber sem invadir a vizinha.
  for (let c = 0; c < cols; c++) {
    const series = model.series[c]
    const maxChars = Math.max(3, Math.floor(cellW / (theme.labelSize * 0.58)))
    const text = truncate(series.name, maxChars)
    if (measureText(text, theme.labelSize, theme.fontFamily) > cellW + 6) continue
    nodes.push({
      t: 'text',
      x: plot.x + c * cellW + cellW / 2,
      y: plot.y - 8,
      text,
      fill: series.muted ? theme.muted : theme.foreground,
      size: theme.labelSize,
      family: theme.fontFamily,
      anchor: 'middle',
      baseline: 'auto',
    })
  }

  for (let r = 0; r < rows; r++) {
    // Rótulo da linha, à esquerda, alinhado ao centro da célula.
    nodes.push({
      t: 'text',
      x: plot.x - 8,
      y: plot.y + r * cellH + cellH / 2,
      text: truncate(model.categoryLabels[r], ROW_LABEL_CHARS),
      fill: theme.muted,
      size: theme.labelSize,
      family: theme.fontFamily,
      anchor: 'end',
      baseline: 'middle',
    })

    for (let c = 0; c < cols; c++) {
      const value = model.series[c].values[r]
      if (value === null || value === undefined) continue

      const fill = color(value)
      const x = plot.x + c * cellW
      const y = plot.y + r * cellH

      nodes.push({
        t: 'rect',
        // O GAP entre células deixa o fundo aparecer: é a grade da matriz sem
        // desenhar linha nenhuma.
        x: x + GAP,
        y: y + GAP,
        w: Math.max(0, cellW - GAP * 2),
        h: Math.max(0, cellH - GAP * 2),
        fill,
        rx: Math.min(2, cellW / 4),
        meta: {
          series: model.series[c].name,
          rowIndex: r,
          category: model.categoryLabels[r],
          value,
        },
      })

      if (labelFits) {
        nodes.push({
          t: 'text',
          x: x + cellW / 2,
          y: y + cellH / 2,
          text: frame.formatDatum(value),
          fill: readableOn(fill, theme.foreground),
          size: Math.min(theme.labelSize, cellH * 0.5),
          weight: 600,
          family: theme.fontFamily,
          anchor: 'middle',
          baseline: 'middle',
        })
      }
    }
  }

  return nodes
}

export const MATRIX_CHARTS: ChartDefinition[] = [
  {
    type: 'heatmap',
    label: 'Mapa de calor',
    hint: 'Cruzar duas dimensões categóricas: cada célula é uma cor pelo valor.',
    group: 'Distribuição e composição',
    orientation: 'vertical',
    categoryKind: () => 'band',
    bare: true,
    supportsDirectLabels: false,
    supportsStacking: false,
    seriesLimit: Infinity,
    suppressLegend: true,
    suppressCategoryAxis: true,
    reserveLeft: heatmapReserveLeft,
    draw: drawHeatmap,
  },
]
