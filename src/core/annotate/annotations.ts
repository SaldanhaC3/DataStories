/**
 * Anotações: o que transforma um gráfico correto num gráfico que explica.
 *
 * Quatro tipos, cada um respondendo a uma pergunta diferente do leitor:
 * - texto com seta: "o que aconteceu aqui?"
 * - faixa: "que período é esse?"
 * - linha de referência: "isso é muito ou pouco?"
 * - destaque de ponto: "qual é o número exato deste ponto?"
 *
 * Texto e seta são posicionados em fração da área de plotagem, para sobreviver
 * a redimensionamento. Faixas e linhas são posicionadas em valor de dado, para
 * continuarem corretas quando a escala muda.
 */

import type {
  Annotation,
  LineAnnotation,
  PointAnnotation,
  RangeAnnotation,
  SceneNode,
  TextAnnotation,
  Theme,
} from '../types'
import type { ChartModel } from '../model'
import type { Frame } from '../frame'
import { measureText, wrapText } from '../text'
import { fade } from '../theme/contrast'
import { parseDate, parseNumber } from '../dataset/infer'
import type { LocaleId } from '../format'

/** Converte um valor escrito pelo usuário em pixel do eixo de categorias. */
function categoryPixel(
  raw: string,
  frame: Frame,
  model: ChartModel,
  locale: LocaleId,
): number | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null

  if (frame.categoryKind === 'band') {
    const index = model.categoryLabels.findIndex(
      (label) => label.toLowerCase() === trimmed.toLowerCase(),
    )
    return index >= 0 ? frame.catPos(index) : null
  }

  // Escalas contínuas: procuramos o valor no domínio, interpolando entre pontos.
  const numeric =
    frame.categoryKind === 'time'
      ? parseDate(trimmed, locale)
      : parseNumber(trimmed, locale)
  if (numeric === null) return null

  const values = model.categories.map((c) => (typeof c === 'number' ? c : Number(c)))
  if (values.length === 0) return null

  // Interpolação linear entre os dois pontos vizinhos: exata porque as escalas
  // contínuas usadas aqui também são lineares em pixel.
  let lo = 0
  let hi = values.length - 1
  if (numeric <= values[lo]) return frame.catPos(lo)
  if (numeric >= values[hi]) return frame.catPos(hi)
  for (let i = 0; i < values.length - 1; i++) {
    if (numeric >= values[i] && numeric <= values[i + 1]) {
      lo = i
      hi = i + 1
      break
    }
  }
  const span = values[hi] - values[lo]
  const t = span === 0 ? 0 : (numeric - values[lo]) / span
  return frame.catPos(lo) + (frame.catPos(hi) - frame.catPos(lo)) * t
}

function axisPixel(
  raw: string,
  axis: 'x' | 'y',
  frame: Frame,
  model: ChartModel,
  locale: LocaleId,
): number | null {
  if (axis === 'y') {
    const n = parseNumber(raw, locale)
    return n === null ? null : frame.valuePos(n)
  }
  return categoryPixel(raw, frame, model, locale)
}

/**
 * Faixa sombreada. Fica atrás das marcas — por isso é devolvida separada e
 * inserida antes delas na cena.
 */
function renderRange(
  annotation: RangeAnnotation,
  frame: Frame,
  model: ChartModel,
  theme: Theme,
  locale: LocaleId,
): SceneNode[] {
  const a = axisPixel(annotation.from, annotation.axis, frame, model, locale)
  const b = axisPixel(annotation.to, annotation.axis, frame, model, locale)
  if (a === null || b === null) return []

  const start = Math.min(a, b)
  const end = Math.max(a, b)
  const color = annotation.color ?? theme.foreground
  const fill = fade(color, 0.09, theme.background)
  const { plot } = frame

  // O eixo da anotação é o do dado, não o da tela: em barras horizontais o
  // eixo de valores é o horizontal.
  const isValueAxis = annotation.axis === 'y'
  const alongScreenX =
    (isValueAxis && frame.orientation === 'horizontal') ||
    (!isValueAxis && frame.orientation === 'vertical')

  const nodes: SceneNode[] = [
    alongScreenX
      ? { t: 'rect', x: start, y: plot.y, w: end - start, h: plot.height, fill }
      : { t: 'rect', x: plot.x, y: start, w: plot.width, h: end - start, fill },
  ]

  if (annotation.label) {
    nodes.push(
      alongScreenX
        ? {
            t: 'text',
            x: (start + end) / 2,
            y: plot.y + theme.labelSize + 2,
            text: annotation.label,
            fill: theme.muted,
            size: theme.labelSize,
            family: theme.fontFamily,
            anchor: 'middle',
          }
        : {
            t: 'text',
            x: plot.x + 6,
            y: (start + end) / 2,
            text: annotation.label,
            fill: theme.muted,
            size: theme.labelSize,
            family: theme.fontFamily,
            anchor: 'start',
            baseline: 'middle',
          },
    )
  }

  return nodes
}

function renderLine(
  annotation: LineAnnotation,
  frame: Frame,
  model: ChartModel,
  theme: Theme,
  locale: LocaleId,
): SceneNode[] {
  const pixel = axisPixel(annotation.value, annotation.axis, frame, model, locale)
  if (pixel === null) return []

  const color = annotation.color ?? theme.foreground
  const dash = annotation.dash ? '5 4' : undefined
  const { plot } = frame

  const isValueAxis = annotation.axis === 'y'
  const alongScreenX =
    (isValueAxis && frame.orientation === 'horizontal') ||
    (!isValueAxis && frame.orientation === 'vertical')

  const nodes: SceneNode[] = [
    alongScreenX
      ? {
          t: 'line',
          x1: pixel,
          y1: plot.y,
          x2: pixel,
          y2: plot.y + plot.height,
          stroke: color,
          strokeWidth: 1.5,
          dash,
        }
      : {
          t: 'line',
          x1: plot.x,
          y1: pixel,
          x2: plot.x + plot.width,
          y2: pixel,
          stroke: color,
          strokeWidth: 1.5,
          dash,
        },
  ]

  if (annotation.label) {
    const width = measureText(annotation.label, theme.labelSize, theme.fontFamily, 600)
    // Em barras horizontais a linha de valor cruza a barra mais longa, que fica
    // no topo; o rotulo desce para o rodape do painel, onde nao cobre dado.
    const labelY =
      frame.orientation === 'horizontal'
        ? plot.y + plot.height - theme.labelSize - 8
        : plot.y + 2
    nodes.push(
      alongScreenX
        ? {
            t: 'rect',
            x: pixel + 5,
            y: labelY,
            w: width + 10,
            h: theme.labelSize + 8,
            fill: theme.background,
            rx: 2,
            opacity: 0.86,
          }
        : {
            t: 'rect',
            x: plot.x + plot.width - width - 12,
            y: pixel - theme.labelSize - 9,
            w: width + 10,
            h: theme.labelSize + 8,
            fill: theme.background,
            rx: 2,
            opacity: 0.86,
          },
      alongScreenX
        ? {
            t: 'text',
            x: pixel + 10,
            y: labelY + theme.labelSize + 1,
            text: annotation.label,
            fill: color,
            size: theme.labelSize,
            weight: 600,
            family: theme.fontFamily,
          }
        : {
            t: 'text',
            x: plot.x + plot.width - 7,
            y: pixel - 6,
            text: annotation.label,
            fill: color,
            size: theme.labelSize,
            weight: 600,
            family: theme.fontFamily,
            anchor: 'end',
          },
    )
  }

  return nodes
}

function renderPoint(
  annotation: PointAnnotation,
  frame: Frame,
  model: ChartModel,
  theme: Theme,
): SceneNode[] {
  const series = model.series.find((s) => s.name === annotation.series)
  if (!series) return []
  const value = series.values[annotation.rowIndex]
  if (value === null || value === undefined) return []

  const base = series.bases ? series.bases[annotation.rowIndex] : 0
  const { x, y } = frame.xy(
    frame.catPos(annotation.rowIndex),
    frame.valuePos(base + value),
  )
  const color = annotation.color ?? series.color

  const text = [annotation.label, annotation.showValue ? frame.formatDatum(value) : '']
    .filter(Boolean)
    .join(' · ')

  const nodes: SceneNode[] = [
    { t: 'circle', cx: x, cy: y, r: 6.5, fill: theme.background },
    { t: 'circle', cx: x, cy: y, r: 4.5, fill: color },
  ]

  if (text) {
    // Empurra o rótulo para dentro quando o ponto está perto da borda direita.
    const width = measureText(text, theme.labelSize, theme.fontFamily, 600)
    const room = frame.plot.x + frame.plot.width - x
    const toLeft = room < width + 16
    nodes.push({
      t: 'text',
      x: toLeft ? x - 10 : x + 10,
      y: y - 9,
      text,
      fill: theme.foreground,
      size: theme.labelSize,
      weight: 600,
      family: theme.fontFamily,
      anchor: toLeft ? 'end' : 'start',
      halo: theme.background,
      haloWidth: 3,
    })
  }

  return nodes
}

function renderText(
  annotation: TextAnnotation,
  frame: Frame,
  theme: Theme,
): SceneNode[] {
  const { plot } = frame
  const x = plot.x + annotation.x * plot.width
  const y = plot.y + annotation.y * plot.height
  const color = annotation.color ?? theme.foreground
  const size = annotation.size
  const weight = annotation.bold ? 700 : 400

  const maxWidth = Math.max(90, plot.width * 0.42)
  const lines = wrapText(annotation.text, maxWidth, size, theme.fontFamily, weight)
  const lineHeight = size * 1.3
  const height = lines.length * lineHeight
  const width = Math.max(
    ...lines.map((l) => measureText(l, size, theme.fontFamily, weight)),
    1,
  )

  const nodes: SceneNode[] = []

  if (annotation.connector.enabled) {
    const tx = plot.x + annotation.connector.tx * plot.width
    const ty = plot.y + annotation.connector.ty * plot.height

    // A seta sai da borda da caixa de texto voltada para o alvo, não do centro:
    // sair do centro faz o traço cruzar as próprias letras.
    const anchorX =
      annotation.align === 'left' ? x : annotation.align === 'right' ? x - width : x - width / 2
    const boxCx = anchorX + width / 2
    const boxCy = y + height / 2
    const dx = tx - boxCx
    const dy = ty - boxCy
    const len = Math.hypot(dx, dy) || 1
    const halfW = width / 2 + 6
    const halfH = height / 2 + 5
    const scale = Math.min(
      Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity,
      Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity,
    )
    const sx = boxCx + dx * Math.min(scale, 1)
    const sy = boxCy + dy * Math.min(scale, 1)

    // Curva suave: a corda reta compete visualmente com as marcas do gráfico.
    const mx = (sx + tx) / 2 - dy * 0.12
    const my = (sy + ty) / 2 + dx * 0.12
    nodes.push({
      t: 'path',
      d: `M${sx},${sy}Q${mx},${my} ${tx},${ty}`,
      stroke: color,
      strokeWidth: 1.2,
      fill: 'none',
      linecap: 'round',
    })

    if (annotation.connector.arrow) {
      const ax = tx - mx
      const ay = ty - my
      const alen = Math.hypot(ax, ay) || 1
      const ux = ax / alen
      const uy = ay / alen
      const size2 = 6
      const p1x = tx - ux * size2 - uy * size2 * 0.5
      const p1y = ty - uy * size2 + ux * size2 * 0.5
      const p2x = tx - ux * size2 + uy * size2 * 0.5
      const p2y = ty - uy * size2 - ux * size2 * 0.5
      nodes.push({
        t: 'path',
        d: `M${tx},${ty}L${p1x},${p1y}L${p2x},${p2y}Z`,
        fill: color,
      })
    }
    void len
  }

  if (annotation.background && lines.length > 0) {
    const boxX =
      annotation.align === 'left' ? x - 6 : annotation.align === 'right' ? x - width - 6 : x - width / 2 - 6
    nodes.push({
      t: 'rect',
      x: boxX,
      y: y - 5,
      w: width + 12,
      h: height + 8,
      fill: theme.background,
      rx: 3,
      opacity: 0.9,
    })
  }

  lines.forEach((line, i) => {
    nodes.push({
      t: 'text',
      x,
      y: y + (i + 1) * lineHeight - size * 0.28,
      text: line,
      fill: color,
      size,
      weight,
      family: theme.fontFamily,
      anchor:
        annotation.align === 'left' ? 'start' : annotation.align === 'right' ? 'end' : 'middle',
      handle: `annotation:${annotation.id}`,
    })
  })

  return nodes
}

export interface AnnotationLayers {
  /** Desenhado antes das marcas. */
  below: SceneNode[]
  /** Desenhado depois das marcas. */
  above: SceneNode[]
}

export function renderAnnotations(
  annotations: Annotation[],
  frame: Frame,
  model: ChartModel,
  theme: Theme,
  locale: LocaleId,
): AnnotationLayers {
  const below: SceneNode[] = []
  const above: SceneNode[] = []

  for (const annotation of annotations) {
    switch (annotation.kind) {
      case 'range':
        below.push(...renderRange(annotation, frame, model, theme, locale))
        break
      case 'line':
        above.push(...renderLine(annotation, frame, model, theme, locale))
        break
      case 'point':
        above.push(...renderPoint(annotation, frame, model, theme))
        break
      case 'text':
        above.push(...renderText(annotation, frame, theme))
        break
    }
  }

  return { below, above }
}
