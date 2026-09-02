/**
 * Rótulos diretos.
 *
 * Uma legenda obriga o leitor a fazer duas leituras: achar a cor no gráfico e
 * traduzir a cor no quadrinho ao lado. O rótulo direto elimina a segunda. É a
 * diferença mais visível entre um gráfico de biblioteca e um gráfico de
 * redação, e por isso vem ligado por padrão.
 *
 * A largura ocupada precisa ser conhecida antes de montar o quadro — daí
 * `measureDirectLabels` ser separado de `renderDirectLabels`.
 */

import type { LabelSpec, SceneNode, Theme } from '../types'
import type { ChartModel, SeriesData } from '../model'
import type { Frame } from '../frame'
import { measureText } from '../text'
import { truncate } from '../format'
import { contrastRatio } from '../theme/contrast'
import { resolveVerticalCollisions, type LabelSlot } from './collision'

const GAP = 8
const MAX_CHARS = 22

function labelledSeries(model: ChartModel, labels: LabelSpec): SeriesData[] {
  if (!labels.directLabels) return []
  if (labels.labelHighlightedOnly) {
    const highlighted = model.series.filter((s) => !s.muted)
    // Se nada está destacado, rotular só os destacados esconderia tudo.
    return highlighted.length > 0 ? highlighted : model.series
  }
  return model.series
}

/** Último índice com valor definido — onde o rótulo encosta. */
function lastDefined(series: SeriesData): number {
  for (let i = series.values.length - 1; i >= 0; i--) {
    if (series.values[i] !== null) return i
  }
  return -1
}

/** Largura a reservar à direita do painel. Zero quando não há rótulos diretos. */
export function measureDirectLabels(
  model: ChartModel,
  labels: LabelSpec,
  theme: Theme,
): number {
  const targets = labelledSeries(model, labels)
  if (targets.length === 0) return 0

  const widths = targets.map((s) =>
    measureText(truncate(s.name, MAX_CHARS), theme.labelSize, theme.fontFamily, 600),
  )
  // Com o valor junto do nome, reserva-se espaço para um número típico — a
  // medida exata só existe depois do quadro montado, e margem curta cortaria o
  // rótulo no meio.
  const valueRoom = labels.valueLabels ? theme.labelSize * 3.2 : 0
  return Math.max(0, Math.max(...widths) + GAP + 4 + valueRoom)
}

/**
 * Desenha os rótulos à direita das linhas, resolvendo sobreposições.
 * Quando um rótulo precisa ser deslocado mais que meia altura de linha, um
 * traço curto o liga de volta ao ponto — sem isso o leitor perde a referência.
 */
export function renderDirectLabels(
  frame: Frame,
  model: ChartModel,
  labels: LabelSpec,
  theme: Theme,
): SceneNode[] {
  const targets = labelledSeries(model, labels)
  if (targets.length === 0) return []

  const lineHeight = theme.labelSize * 1.15
  const entries: Array<{ series: SeriesData; slot: LabelSlot; x: number }> = []

  for (const series of targets) {
    const index = lastDefined(series)
    if (index < 0) continue
    const value = series.values[index]!
    const base = series.bases ? series.bases[index] : 0
    const point = frame.xy(frame.catPos(index), frame.valuePos(base + value))
    entries.push({
      series,
      x: point.x,
      slot: { target: point.y, height: lineHeight, y: point.y },
    })
  }

  if (entries.length === 0) return []

  resolveVerticalCollisions(
    entries.map((e) => e.slot),
    { top: frame.plot.y - 4, bottom: frame.plot.y + frame.plot.height + 4 },
    3,
  )

  const nodes: SceneNode[] = []
  for (const entry of entries) {
    // O rótulo leva o último valor junto quando os valores estão ligados: a
    // pergunta de quem lê uma linha até o fim é "terminou em quanto?", e o
    // nome sozinho deixa a resposta no tooltip.
    const index = lastDefined(entry.series)
    const value = index >= 0 ? entry.series.values[index] : null
    const text =
      labels.valueLabels && value !== null
        ? `${truncate(entry.series.name, MAX_CHARS)}  ${frame.formatDatum(value)}`
        : truncate(entry.series.name, MAX_CHARS)
    const x = Math.min(entry.x + GAP, frame.plot.x + frame.plot.width + GAP)

    // Deslocou o bastante para o leitor perder a linha de vista? Liga com um traço.
    if (Math.abs(entry.slot.y - entry.slot.target) > lineHeight * 0.55) {
      nodes.push({
        t: 'path',
        d: `M${entry.x + 2},${entry.slot.target}L${x - 2},${entry.slot.y}`,
        stroke: entry.series.color,
        strokeWidth: 1,
        fill: 'none',
        opacity: 0.55,
      })
    }

    nodes.push({
      t: 'text',
      x,
      y: entry.slot.y,
      text,
      fill: entry.series.color,
      size: theme.labelSize,
      weight: 600,
      family: theme.fontFamily,
      anchor: 'start',
      baseline: 'middle',
      handle: `direct-label:${entry.series.name}`,
    })
  }

  return nodes
}

/**
 * Rótulos de valor sobre as marcas.
 *
 * A regra de posicionamento é simples e previsível: fora da marca quando cabe,
 * dentro dela quando não cabe. Dentro, o texto vira branco ou preto conforme o
 * contraste com a cor da barra — checado, não chutado.
 */
export interface ValueLabelOptions {
  /** Cor do fundo, para escolher o texto legível dentro da marca. */
  background: string
  size: number
  family: string
  /** Distância entre a marca e o rótulo quando ele fica fora. */
  offset?: number
}

export function valueLabelNode(
  text: string,
  markStart: number,
  markEnd: number,
  crossPosition: number,
  orientation: 'vertical' | 'horizontal',
  color: string,
  options: ValueLabelOptions,
): SceneNode {
  const offset = options.offset ?? 6
  const size = options.size
  const extent = Math.abs(markEnd - markStart)
  const needed = orientation === 'vertical' ? size * 1.5 : measureText(text, size, options.family) + 10
  const inside = extent > needed
  const direction = markEnd >= markStart ? 1 : -1

  if (orientation === 'vertical') {
    // direction < 0 = marca positiva (cresce para cima na tela).
    const y = inside
      ? direction < 0
        ? markEnd + size + 4
        : markEnd - 6
      : direction < 0
        ? markEnd - offset
        : markEnd + offset + size
    return {
      t: 'text',
      x: crossPosition,
      y,
      text,
      fill: inside ? readableOn(color, options.background) : color,
      size,
      weight: 600,
      family: options.family,
      anchor: 'middle',
    }
  }

  return {
    t: 'text',
    x: inside ? markEnd - direction * 8 : markEnd + direction * offset,
    y: crossPosition,
    text,
    fill: inside ? readableOn(color, options.background) : color,
    size,
    weight: 600,
    family: options.family,
    anchor: inside ? (direction > 0 ? 'end' : 'start') : direction > 0 ? 'start' : 'end',
    baseline: 'middle',
  }
}

/** Preto ou branco sobre a cor da marca — o que passar em 3:1. */
function readableOn(fill: string, fallback: string): string {
  if (contrastRatio('#ffffff', fill) >= 3) return '#ffffff'
  if (contrastRatio('#111111', fill) >= 3) return '#111111'
  return fallback
}
