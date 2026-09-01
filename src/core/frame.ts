/**
 * O quadro do gráfico: margens, escalas, eixos, cabeçalho e rodapé.
 *
 * É aqui que o "parece um gráfico de jornal" acontece, e as decisões são
 * deliberadas:
 *
 * - Sem moldura em volta da área de plotagem e sem traços de tick. A grade
 *   sozinha já ancora a leitura.
 * - Grade só no eixo de valores. Grade cruzada vira gaiola.
 * - Rótulos de valor ficam soltos à esquerda, sem linha de eixo.
 * - A linha do zero é mais escura que a grade quando o domínio cruza o zero.
 * - Rótulos de categoria nunca são rotacionados: se não cabem, são rareados.
 *   Rotacionar rótulo é sintoma de gráfico errado, e o linter sugere barras
 *   horizontais em vez disso.
 * - As margens são calculadas medindo o texto real, não chutadas.
 */

import { scaleBand, scaleLinear, scaleLog, scaleTime } from 'd3-scale'
import type { ChartSpec, PlotArea, SceneNode, Theme } from './types'
import type { ChartModel } from './model'
import {
  abbreviate,
  autoDatePattern,
  autoNumberFormatter,
  formatDate,
  formatNumber,
  truncate,
} from './format'
import type { LocaleId } from './format'
import { blockHeight, LINE_HEIGHT, measureText, wrapText } from './text'
import { mix } from './theme/contrast'

export type Orientation = 'vertical' | 'horizontal'
export type CategoryScaleKind = 'band' | 'linear' | 'time'

export interface Tick {
  value: number
  label: string
  /** Posição em pixels no sistema de coordenadas final. */
  position: number
}

export interface Frame {
  plot: PlotArea
  orientation: Orientation
  categoryKind: CategoryScaleKind
  /** Largura da faixa de cada categoria, quando `categoryKind === 'band'`. */
  band: number
  /** Centro da categoria `i`, em pixels do eixo de categorias. */
  catPos: (index: number) => number
  /** Posição de um valor numérico, em pixels do eixo de valores. */
  valuePos: (value: number) => number
  /** Inverso de `valuePos`, para arrastar anotações. */
  valueAt: (pixel: number) => number
  /** Combina os dois eixos respeitando a orientação. */
  xy: (categoryPixel: number, valuePixel: number) => { x: number; y: number }
  valueTicks: Tick[]
  categoryTicks: Tick[]
  /** Nós de cabeçalho, rodapé, grade e rótulos de eixo, já prontos. */
  chrome: { header: SceneNode[]; footer: SceneNode[]; axes: SceneNode[] }
  /** Formata um valor para rótulo de eixo: precisão do passo entre ticks. */
  formatValue: (v: number) => string
  /**
   * Formata um valor para rótulo sobre a marca. Diferente de `formatValue`
   * porque a precisão vem do dado, não do eixo: com ticks de 10 em 10, um
   * valor de 87,4 não pode virar "87" em cima da barra.
   */
  formatDatum: (v: number) => string
}

const PADDING = 26
const FOOTER_GAP = 14
const AXIS_GAP = 10

function pickTickCount(pixels: number): number {
  return Math.max(2, Math.min(10, Math.round(pixels / 58)))
}

/**
 * Rareia rótulos de categoria até que caibam lado a lado. Devolve o passo:
 * 1 = todos, 2 = um sim um não, e assim por diante.
 */
function thinningStep(
  labels: string[],
  available: number,
  size: number,
  family: string,
): number {
  if (labels.length === 0) return 1
  const widest = Math.max(...labels.map((l) => measureText(l, size, family)))
  const perLabel = available / labels.length
  if (widest + 8 <= perLabel) return 1
  return Math.max(1, Math.ceil((widest + 8) / perLabel))
}

export interface FrameInput {
  spec: ChartSpec
  model: ChartModel
  theme: Theme
  locale: LocaleId
  width: number
  height: number
  orientation: Orientation
  categoryKind: CategoryScaleKind
  /** Espaço extra reservado à direita para rótulos diretos. */
  reserveRight?: number
  /** Espaço extra reservado acima do painel, para a legenda. */
  reserveTop?: number
  /** Desliga a grade e os eixos (donut, waffle, treemap). */
  bare?: boolean
  /** O renderizador desenha seus proprios rotulos de categoria. */
  suppressCategoryAxis?: boolean
}

export function buildFrame(input: FrameInput): Frame {
  const { spec, model, theme, locale, width, height, orientation, categoryKind } = input
  const font = theme.fontFamily
  const labelSize = theme.labelSize

  // ---- Cabeçalho -----------------------------------------------------------
  const contentWidth = width - PADDING * 2
  const titleLines = wrapText(
    spec.text.title,
    contentWidth,
    theme.titleSize,
    theme.titleFamily,
    theme.titleWeight,
  )
  const subtitleLines = wrapText(
    spec.text.subtitle,
    contentWidth,
    theme.subtitleSize,
    font,
  )

  const header: SceneNode[] = []
  let cursorY = PADDING

  if (theme.rule && (titleLines.length > 0 || subtitleLines.length > 0)) {
    header.push({
      t: 'rect',
      x: PADDING,
      y: cursorY,
      w: 36,
      h: 3,
      fill: theme.accent,
      handle: 'rule',
    })
    cursorY += 3 + 12
  }

  for (const line of titleLines) {
    cursorY += theme.titleSize
    header.push({
      t: 'text',
      x: PADDING,
      y: cursorY,
      text: line,
      fill: theme.foreground,
      size: theme.titleSize,
      weight: theme.titleWeight,
      family: theme.titleFamily,
      handle: 'title',
    })
    cursorY += theme.titleSize * (LINE_HEIGHT - 1)
  }

  if (subtitleLines.length > 0) {
    cursorY += titleLines.length > 0 ? 6 : 0
    for (const line of subtitleLines) {
      cursorY += theme.subtitleSize
      header.push({
        t: 'text',
        x: PADDING,
        y: cursorY,
        text: line,
        fill: theme.muted,
        size: theme.subtitleSize,
        family: font,
        handle: 'subtitle',
      })
      cursorY += theme.subtitleSize * (LINE_HEIGHT - 1)
    }
  }

  const headerBottom = cursorY + (header.length > 0 ? 18 : 0)

  // ---- Rodapé --------------------------------------------------------------
  const footer: SceneNode[] = []
  const footerParts: string[] = []
  if (spec.text.source) footerParts.push(`Fonte: ${spec.text.source}`)
  if (spec.text.note) footerParts.push(spec.text.note)
  const footerText = footerParts.join('   ·   ')
  const creditWidth = spec.text.credit
    ? measureText(spec.text.credit, theme.footerSize, font) + 16
    : 0
  const footerLines = wrapText(
    footerText,
    contentWidth - creditWidth,
    theme.footerSize,
    font,
  )

  let footerHeight = 0
  if (footerLines.length > 0 || spec.text.credit) {
    footerHeight =
      FOOTER_GAP + blockHeight(Math.max(1, footerLines.length), theme.footerSize) + 2
  }

  const footerTop = height - PADDING - footerHeight
  if (footerHeight > 0) {
    footer.push({
      t: 'line',
      x1: PADDING,
      y1: footerTop + 1,
      x2: width - PADDING,
      y2: footerTop + 1,
      stroke: theme.grid,
      strokeWidth: 1,
      handle: 'footer-rule',
    })
    let fy = footerTop + FOOTER_GAP
    for (const line of footerLines) {
      fy += theme.footerSize
      footer.push({
        t: 'text',
        x: PADDING,
        y: fy,
        text: line,
        fill: theme.muted,
        size: theme.footerSize,
        family: font,
        handle: 'source',
      })
      fy += theme.footerSize * (LINE_HEIGHT - 1)
    }
    if (spec.text.credit) {
      footer.push({
        t: 'text',
        x: width - PADDING,
        y: footerTop + FOOTER_GAP + theme.footerSize,
        text: spec.text.credit,
        fill: theme.muted,
        size: theme.footerSize,
        family: font,
        anchor: 'end',
        handle: 'credit',
      })
    }
  }

  // ---- Margens do painel ---------------------------------------------------
  const [domainMin, domainMax] = model.yDomain
  const availableHeight = Math.max(40, footerTop - headerBottom)

  const valueAxisPixels = orientation === 'vertical' ? availableHeight : contentWidth
  const rawTicks = makeValueTicks(
    domainMin,
    domainMax,
    spec.axes.y.ticks ?? pickTickCount(valueAxisPixels),
    spec.axes.y.log,
  )
  const formatValue = makeValueFormatter(rawTicks, spec, locale, model)

  const tickLabels = rawTicks.map(formatValue)
  const widestTick = tickLabels.length
    ? Math.max(...tickLabels.map((l) => measureText(l, labelSize, font)))
    : 0

  const categoryLabels = model.categoryLabels.map((l) => truncate(l, 28))
  const widestCategory = categoryLabels.length
    ? Math.max(...categoryLabels.map((l) => measureText(l, labelSize, font)))
    : 0

  const bare = input.bare ?? false
  const showValueAxis = spec.axes.y.visible && !bare
  const showCategoryAxis =
    spec.axes.x.visible && !bare && !input.suppressCategoryAxis

  let left = PADDING
  let right = PADDING + (input.reserveRight ?? 0)
  let top = headerBottom
  let bottom = footerTop

  if (orientation === 'vertical') {
    if (showValueAxis) left += widestTick + AXIS_GAP
    if (showCategoryAxis) bottom -= labelSize * LINE_HEIGHT + AXIS_GAP
    // Espaço para o rótulo de topo não encostar no subtítulo.
    top += 6
  } else {
    if (showCategoryAxis) left += Math.min(widestCategory + AXIS_GAP, contentWidth * 0.42)
    if (showValueAxis) bottom -= labelSize * LINE_HEIGHT + AXIS_GAP
    top += 6
  }

  if (spec.axes.y.title) {
    top += theme.labelSize * LINE_HEIGHT
  }
  top += input.reserveTop ?? 0

  const plot: PlotArea = {
    x: left,
    y: top,
    width: Math.max(20, width - right - left),
    height: Math.max(20, bottom - top),
  }

  // ---- Escalas -------------------------------------------------------------
  const valueRange: [number, number] =
    orientation === 'vertical'
      ? [plot.y + plot.height, plot.y]
      : [plot.x, plot.x + plot.width]

  const valueScale = spec.axes.y.log && domainMin > 0
    ? scaleLog().domain([domainMin, domainMax]).range(valueRange)
    : scaleLinear().domain([domainMin, domainMax]).range(valueRange)

  const catRange: [number, number] =
    orientation === 'vertical'
      ? [plot.x, plot.x + plot.width]
      : [plot.y, plot.y + plot.height]

  let catPos: (index: number) => number
  let band = 0
  const categoryTicks: Tick[] = []

  if (categoryKind === 'band') {
    const scale = scaleBand<number>()
      .domain(model.categories.map((_, i) => i))
      .range(catRange)
      .paddingInner(spec.chart.options.barPadding)
      .paddingOuter(spec.chart.options.barPadding / 2)
    band = scale.bandwidth()
    catPos = (i) => (scale(i) ?? 0) + band / 2

    const available = orientation === 'vertical' ? plot.width : plot.height
    const step =
      orientation === 'vertical'
        ? thinningStep(categoryLabels, available, labelSize, font)
        : Math.max(1, Math.ceil((labelSize * LINE_HEIGHT + 4) / (available / Math.max(1, categoryLabels.length))))

    model.categories.forEach((_, i) => {
      if (i % step !== 0 && i !== model.categories.length - 1) return
      categoryTicks.push({ value: i, label: categoryLabels[i], position: catPos(i) })
    })
  } else {
    const numeric = model.categories.map((c) =>
      typeof c === 'number' ? c : Number(c),
    )
    const finite = numeric.filter((n) => Number.isFinite(n))
    const domain: [number, number] = finite.length
      ? [Math.min(...finite), Math.max(...finite)]
      : [0, 1]
    if (domain[0] === domain[1]) {
      domain[0] -= 1
      domain[1] += 1
    }

    if (categoryKind === 'time') {
      const scale = scaleTime()
        .domain([new Date(domain[0]), new Date(domain[1])])
        .range(catRange)
      catPos = (i) => scale(new Date(numeric[i]))
      const pattern = autoDatePattern(domain[1] - domain[0])
      const count = pickTickCount(
        orientation === 'vertical' ? plot.width : plot.height,
      )
      for (const date of scale.ticks(count)) {
        categoryTicks.push({
          value: date.getTime(),
          label: formatDate(date.getTime(), pattern, locale),
          position: scale(date),
        })
      }
    } else {
      const scale = scaleLinear().domain(domain).range(catRange)
      catPos = (i) => scale(numeric[i])
      const count = pickTickCount(
        orientation === 'vertical' ? plot.width : plot.height,
      )
      const ticks = scale.ticks(count)
      const fmt = autoNumberFormatter(ticks, locale)
      for (const tick of ticks) {
        categoryTicks.push({ value: tick, label: fmt(tick), position: scale(tick) })
      }
    }
  }

  const formatDatum = makeDatumFormatter(model, spec, locale)

  const valueTicks: Tick[] = rawTicks.map((value, i) => ({
    value,
    label: tickLabels[i],
    position: valueScale(value),
  }))

  const xy = (categoryPixel: number, valuePixel: number) =>
    orientation === 'vertical'
      ? { x: categoryPixel, y: valuePixel }
      : { x: valuePixel, y: categoryPixel }

  // ---- Grade e rótulos de eixo --------------------------------------------
  const axes: SceneNode[] = []

  if (!bare) {
    const crossesZero = domainMin < 0 && domainMax > 0
    const zeroPixel = valueScale(0)

    for (const tick of valueTicks) {
      const isZero = crossesZero && Math.abs(tick.value) < 1e-9
      if (spec.axes.y.grid) {
        const a = xy(catRange[0], tick.position)
        const b = xy(catRange[1], tick.position)
        axes.push({
          t: 'line',
          x1: orientation === 'vertical' ? plot.x : a.x,
          y1: orientation === 'vertical' ? a.y : plot.y,
          x2: orientation === 'vertical' ? plot.x + plot.width : b.x,
          y2: orientation === 'vertical' ? b.y : plot.y + plot.height,
          stroke: isZero ? theme.axis : theme.grid,
          strokeWidth: 1,
        })
      }
      if (showValueAxis) {
        const label = tick.label + (tick === valueTicks[valueTicks.length - 1] ? spec.axes.y.unit : '')
        if (orientation === 'vertical') {
          axes.push({
            t: 'text',
            x: plot.x - AXIS_GAP,
            y: tick.position,
            text: label,
            fill: theme.muted,
            size: labelSize,
            family: font,
            anchor: 'end',
            baseline: 'middle',
          })
        } else {
          axes.push({
            t: 'text',
            x: tick.position,
            y: plot.y + plot.height + AXIS_GAP + labelSize * 0.85,
            text: label,
            fill: theme.muted,
            size: labelSize,
            family: font,
            anchor: 'middle',
          })
        }
      }
    }

    // Linha de base: separa o desenho do eixo de categorias.
    if (!spec.axes.y.grid || !crossesZero) {
      const baseline =
        domainMin <= 0 && domainMax >= 0 ? zeroPixel : valueScale(domainMin)
      if (orientation === 'vertical') {
        axes.push({
          t: 'line',
          x1: plot.x,
          y1: baseline,
          x2: plot.x + plot.width,
          y2: baseline,
          stroke: theme.axis,
          strokeWidth: 1,
        })
      } else {
        axes.push({
          t: 'line',
          x1: baseline,
          y1: plot.y,
          x2: baseline,
          y2: plot.y + plot.height,
          stroke: theme.axis,
          strokeWidth: 1,
        })
      }
    }

    if (showCategoryAxis) {
      for (const tick of categoryTicks) {
        if (orientation === 'vertical') {
          axes.push({
            t: 'text',
            x: tick.position,
            y: plot.y + plot.height + AXIS_GAP + labelSize * 0.85,
            text: tick.label,
            fill: theme.muted,
            size: labelSize,
            family: font,
            anchor: 'middle',
          })
        } else {
          axes.push({
            t: 'text',
            x: plot.x - AXIS_GAP,
            y: tick.position,
            text: tick.label,
            fill: theme.muted,
            size: labelSize,
            family: font,
            anchor: 'end',
            baseline: 'middle',
          })
        }
      }
    }

    if (spec.axes.y.title) {
      axes.push({
        t: 'text',
        x: plot.x - (orientation === 'vertical' ? widestTick + AXIS_GAP : 0),
        y: plot.y - 10,
        text: spec.axes.y.title,
        fill: theme.muted,
        size: labelSize,
        family: font,
        anchor: 'start',
      })
    }
    if (spec.axes.x.title) {
      axes.push({
        t: 'text',
        x: plot.x + plot.width,
        y: plot.y + plot.height + AXIS_GAP + labelSize * 2.1,
        text: spec.axes.x.title,
        fill: theme.muted,
        size: labelSize,
        family: font,
        anchor: 'end',
      })
    }
  }

  return {
    plot,
    orientation,
    categoryKind,
    band,
    catPos,
    valuePos: (v) => valueScale(v),
    valueAt: (pixel) => (valueScale.invert as (p: number) => number)(pixel),
    xy,
    valueTicks,
    categoryTicks,
    chrome: { header, footer, axes },
    formatValue,
    formatDatum,
  }
}

/**
 * Precisao de rotulo de valor deduzida dos proprios numeros: contamos as casas
 * decimais realmente presentes, ate duas. Numeros grandes sao abreviados.
 */
function makeDatumFormatter(
  model: ChartModel,
  spec: ChartSpec,
  locale: LocaleId,
): (v: number) => string {
  if (spec.axes.y.format) {
    const custom = spec.axes.y.format
    return (v) => {
      try {
        return formatNumber(v, custom, locale)
      } catch {
        return formatNumber(v, ',', locale)
      }
    }
  }
  if (model.normalized) return (v) => `${Math.round(v)}%`

  let decimals = 0
  let maxAbs = 0
  for (const series of model.series) {
    for (const value of series.values) {
      if (value === null || !Number.isFinite(value)) continue
      maxAbs = Math.max(maxAbs, Math.abs(value))
      if (decimals < 2 && !Number.isInteger(value)) {
        const text = String(Math.abs(value))
        const dot = text.indexOf('.')
        if (dot >= 0) decimals = Math.max(decimals, Math.min(2, text.length - dot - 1))
      }
    }
  }

  if (maxAbs >= 10_000) return (v) => abbreviate(v, locale)
  return (v) => formatNumber(v, `,.${decimals}f`, locale)
}

/** Ticks "redondos" no domínio, respeitando escala log. */
function makeValueTicks(
  min: number,
  max: number,
  count: number,
  log: boolean,
): number[] {
  if (log && min > 0) {
    return scaleLog().domain([min, max]).ticks(count)
  }
  return scaleLinear().domain([min, max]).ticks(count)
}

function makeValueFormatter(
  ticks: number[],
  spec: ChartSpec,
  locale: LocaleId,
  model: ChartModel,
): (v: number) => string {
  const auto = autoNumberFormatter(ticks, locale)

  if (spec.axes.y.format) {
    const custom = spec.axes.y.format
    return (v) => {
      try {
        return formatNumber(v, custom, locale)
      } catch {
        // Especificador inválido digitado pelo usuário: cai no automático em
        // vez de quebrar o gráfico inteiro enquanto ele ainda está digitando.
        return auto(v)
      }
    }
  }
  if (model.normalized) return (v) => `${Math.round(v)}%`
  return auto
}

/** Cor de grade um pouco mais forte, para uso pontual pelos renderizadores. */
export function strongGrid(theme: Theme): string {
  return mix(theme.grid, theme.foreground, 0.25)
}
