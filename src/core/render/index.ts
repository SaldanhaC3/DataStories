/**
 * Registro de gráficos e montagem da cena.
 *
 * `renderChart` é o único ponto de entrada do desenho, usado pelo editor, pelo
 * export SVG/PNG e pelo embed. A ordem de montagem importa e está fixada aqui:
 * fundo, faixas de anotação, grade, marcas, rótulos, anotações por cima.
 */

import type {
  ChartSpec,
  ChartType,
  Dataset,
  Scene,
  SceneNode,
  ScenePoint,
  Theme,
} from '../types'
import { buildFrame } from '../frame'
import { buildModel, type ChartModel } from '../model'
import { measureDirectLabels, renderDirectLabels } from '../annotate/directLabels'
import { renderAnnotations } from '../annotate/annotations'
import { measureText } from '../text'
import { truncate } from '../format'
import { getTheme } from '../theme/themes'
import type { ChartDefinition } from './context'
import { CARTESIAN_CHARTS } from './cartesian'
import { COMPARISON_CHARTS } from './comparison'
import { DISTRIBUTION_CHARTS } from './distribution'
import { PARTITION_CHARTS } from './partition'
import { EDITORIAL_CHARTS } from './editorial'
import { MATRIX_CHARTS } from './matrix'

export * from './context'

const DEFINITIONS: ChartDefinition[] = [
  ...CARTESIAN_CHARTS,
  ...COMPARISON_CHARTS,
  ...DISTRIBUTION_CHARTS,
  ...PARTITION_CHARTS,
  ...EDITORIAL_CHARTS,
  ...MATRIX_CHARTS,
]

const REGISTRY = new Map<ChartType, ChartDefinition>(
  DEFINITIONS.map((definition) => [definition.type, definition]),
)

export function getChartDefinition(type: ChartType): ChartDefinition {
  const definition = REGISTRY.get(type)
  if (!definition) throw new Error(`Tipo de gráfico desconhecido: ${type}`)
  return definition
}

export function allChartDefinitions(): ChartDefinition[] {
  return DEFINITIONS
}

/**
 * Legenda no topo. Só é desenhada quando os rótulos diretos estão desligados —
 * as duas coisas juntas seriam redundância. Quando `spec.labels.legendPos`
 * existe, ela é desenhada ali (fração do quadro) em vez do topo do painel, e
 * cada nó carrega o handle `legend` para o editor permitir arrastá-la.
 */
function renderLegend(
  model: ChartModel,
  theme: Theme,
  x: number,
  y: number,
  maxWidth: number,
): { nodes: SceneNode[]; height: number } {
  const nodes: SceneNode[] = []
  let cursorX = x
  let cursorY = y + theme.labelSize
  let lines = 1

  for (const series of model.series) {
    const label = truncate(series.name, 24)
    const width = measureText(label, theme.labelSize, theme.fontFamily) + 24
    if (cursorX + width > x + maxWidth && cursorX > x) {
      cursorX = x
      cursorY += theme.labelSize * 1.6
      lines++
    }
    nodes.push(
      {
        t: 'rect',
        x: cursorX,
        y: cursorY - theme.labelSize * 0.72,
        w: 10,
        h: 10,
        rx: 2,
        fill: series.color,
        handle: 'legend',
      },
      {
        t: 'text',
        x: cursorX + 15,
        y: cursorY,
        text: label,
        fill: series.muted ? theme.muted : theme.foreground,
        size: theme.labelSize,
        family: theme.fontFamily,
        handle: 'legend',
      },
    )
    cursorX += width
  }

  return { nodes, height: lines * theme.labelSize * 1.6 }
}

export interface RenderOptions {
  spec: ChartSpec
  dataset: Dataset
  /** Sobrepõe as dimensões do spec, para preview responsivo. */
  width?: number
  height?: number
  theme?: Theme
}

export function renderChart(options: RenderOptions): Scene {
  const { spec, dataset } = options
  const theme = options.theme ?? getTheme(spec.theme.id, spec.theme.overrides)
  const width = options.width ?? spec.layout.width
  const height = options.height ?? spec.layout.height
  const locale = spec.data.locale

  const definition = getChartDefinition(spec.chart.type)

  let model = buildModel({ spec, dataset, theme })
  if (definition.transformModel) {
    model = definition.transformModel(model, spec)
  }

  const wantsDirectLabels =
    definition.supportsDirectLabels && spec.labels.directLabels && !definition.bare
  const reserveRight = wantsDirectLabels
    ? measureDirectLabels(model, spec.labels, theme)
    : 0

  const showLegend =
    !definition.bare &&
    !definition.suppressLegend &&
    model.series.length > 1 &&
    (spec.labels.legend === 'top' ||
      (spec.labels.legend === 'auto' && !wantsDirectLabels))

  // A legenda e medida antes do quadro para que o painel ceda a altura dela,
  // em vez de a legenda ser desenhada por cima das marcas. Posicionada à mão,
  // ela flutua sobre o desenho: o painel volta a usar o espaço inteiro.
  const legendFree = spec.labels.legendPos != null
  const legendHeight = showLegend
    ? renderLegend(model, theme, 0, 0, Math.max(120, width - 52)).height + 6
    : 0

  const frame = buildFrame({
    spec,
    model,
    theme,
    locale,
    width,
    height,
    orientation: definition.orientation,
    categoryKind: definition.categoryKind(model, spec),
    reserveRight,
    bare: definition.bare,
    suppressCategoryAxis: definition.suppressCategoryAxis,
    reserveLeft: definition.reserveLeft?.(model, spec, theme) ?? 0,
    reserveTop: legendFree ? 0 : legendHeight,
  })

  const nodes: SceneNode[] = [
    { t: 'rect', x: 0, y: 0, w: width, h: height, fill: theme.background },
    ...frame.chrome.header,
  ]

  if (showLegend) {
    const pos = spec.labels.legendPos
    const legend = pos
      ? renderLegend(model, theme, pos.x * width, pos.y * height, width - pos.x * width - 8)
      : renderLegend(
          model,
          theme,
          frame.plot.x,
          frame.plot.y - legendHeight,
          frame.plot.width,
        )
    nodes.push(...legend.nodes)
  }

  const annotations = renderAnnotations(spec.annotations, frame, model, theme, locale)

  nodes.push(...annotations.below)
  nodes.push(...frame.chrome.axes)

  const points: ScenePoint[] = []
  const marks = definition.draw({
    spec,
    model,
    theme,
    frame,
    locale,
    collectPoint: (point) => points.push(point),
  })
  // Marcas que ja existem uma por observacao (barras, dispersao, pirulito,
  // fatias) entram no indice de graca, lendo a geometria que elas mesmas tem.
  // So quem desenha a serie como um caminho unico precisa chamar collectPoint.
  if (points.length === 0) collectFromMarks(marks, points)
  nodes.push(...marks)

  if (wantsDirectLabels) {
    nodes.push(...renderDirectLabels(frame, model, spec.labels, theme))
  }

  nodes.push(...annotations.above)
  nodes.push(...frame.chrome.footer)

  return {
    width,
    height,
    background: theme.background,
    plot: frame.plot,
    nodes,
    series: model.series.map((s) => ({ name: s.name, color: s.color, muted: s.muted })),
    categories: model.categoryLabels,
    points,
  }
}

/**
 * Deriva o indice de hover da geometria das proprias marcas.
 *
 * O ponto de ancoragem e o centro do retangulo ou do circulo. Para uma barra
 * isso poe o alvo no meio dela, que e onde o cursor naturalmente esta quando a
 * pessoa quer ler aquele valor.
 */
function collectFromMarks(nodes: SceneNode[], out: ScenePoint[]): void {
  for (const node of nodes) {
    if (node.t === 'g') {
      collectFromMarks(node.children, out)
      continue
    }
    if (!node.meta) continue
    if (node.t === 'rect') {
      out.push({ ...node.meta, x: node.x + node.w / 2, y: node.y + node.h / 2 })
    } else if (node.t === 'circle') {
      out.push({ ...node.meta, x: node.cx, y: node.cy })
    }
  }
}

/** Reexporta o modelo e o quadro para quem precisa mapear cliques de volta ao dado. */
export { buildModel, buildFrame }
