/**
 * Modelo normalizado do gráfico.
 *
 * Entre o `ChartSpec` (o que o usuário pediu) e os renderizadores (que só
 * desenham) existe esta camada: ela resolve formato longo vs. largo, aplica
 * empilhamento, decide cores, marca o que está destacado e calcula o domínio
 * numérico. Todo renderizador cartesiano parte daqui, então uma correção de
 * cor ou de destaque vale para todos de uma vez.
 */

import type {
  CellValue,
  ChartSpec,
  ColumnType,
  Dataset,
  SeriesInfo,
  Theme,
} from './types'
import { columnOf, distinctValues, pivotLongToWide } from './dataset/transform'
import { categorical, sampleRamp } from './theme/palettes'
import { autoDatePattern, formatDate, type LocaleId } from './format'

export interface SeriesData extends SeriesInfo {
  /** Um valor por categoria, alinhado ao índice de `categories`. */
  values: Array<number | null>
  /** Índice da linha original, para anotações de ponto e tooltip. */
  rowIndexes: number[]
  /** Base acumulada por categoria, quando empilhado. */
  bases?: number[]
}

export interface ChartModel {
  categories: CellValue[]
  categoryLabels: string[]
  xType: ColumnType
  xColumn: string
  series: SeriesData[]
  /** Domínio numérico já com zero forçado e limites manuais aplicados. */
  yDomain: [number, number]
  stacked: boolean
  /** Verdadeiro quando o eixo de valores empilha para 100%. */
  normalized: boolean
  /**
   * Espaco livre para renderizadores que reescrevem o modelo guardarem o que
   * calcularam (quartis do boxplot, faixas do histograma). Fica fora do
   * contrato geral de proposito: so quem escreveu o transform le de volta.
   */
  extra?: Record<string, unknown>
}

export interface BuildContext {
  spec: ChartSpec
  dataset: Dataset
  theme: Theme
}

/**
 * Rotulo legivel de uma categoria. Datas chegam aqui como epoch ms; imprimi-las
 * cruas seria o bug mais visivel possivel, entao o padrao vem da amplitude do
 * proprio conjunto.
 */
function labelFor(
  value: CellValue,
  type: ColumnType,
  locale: LocaleId,
  pattern: string,
): string {
  if (value === null) return '—'
  if (type === 'date' && typeof value === 'number') {
    return formatDate(value, pattern, locale)
  }
  return String(value)
}

/**
 * Descobre a coluna do eixo x quando o spec não a define: preferimos data,
 * depois categoria, depois a primeira coluna que sobrar.
 */
export function inferXColumn(dataset: Dataset): string | null {
  const date = dataset.columns.find((c) => c.type === 'date')
  if (date) return date.name
  const category = dataset.columns.find((c) => c.type === 'category')
  if (category) return category.name
  return dataset.columns[0]?.name ?? null
}

/** Colunas numéricas que sobram depois de tirar as já usadas em outros papéis. */
export function inferYColumns(dataset: Dataset, exclude: (string | null)[]): string[] {
  const taken = new Set(exclude.filter(Boolean) as string[])
  return dataset.columns
    .filter((c) => c.type === 'number' && !taken.has(c.name))
    .map((c) => c.name)
}

function resolveColors(
  names: string[],
  ctx: BuildContext,
): Array<{ color: string; muted: boolean }> {
  const { spec, theme } = ctx
  const highlighted = new Set(spec.highlight.series)
  const hasHighlight = highlighted.size > 0

  let base: string[]
  switch (spec.color.kind) {
    case 'sequential':
      base = sampleRamp(theme.sequential, names.length)
      break
    case 'diverging':
      base = sampleRamp(theme.diverging, names.length)
      break
    case 'single':
      base = names.map(() => theme.accent)
      break
    default:
      base = categorical(theme.palette, names.length)
  }
  if (spec.color.reverse) base = [...base].reverse()

  return names.map((name, i) => {
    const muted = hasHighlight && !highlighted.has(name)
    const override = spec.color.overrides[name]
    return {
      color: muted ? theme.mutedSeries : override ?? base[i],
      muted,
    }
  })
}

/**
 * Aplica empilhamento. Valores negativos empilham para baixo do zero, o que
 * mantém o gráfico correto quando há saldo positivo e negativo na mesma
 * categoria — caso que muitas ferramentas quebram.
 */
function applyStacking(series: SeriesData[], normalized: boolean): void {
  const count = series[0]?.values.length ?? 0

  for (let i = 0; i < count; i++) {
    let totalAbs = 0
    if (normalized) {
      for (const s of series) totalAbs += Math.abs(s.values[i] ?? 0)
    }

    let positive = 0
    let negative = 0
    for (const s of series) {
      let value = s.values[i]
      if (value === null) {
        s.bases![i] = 0
        continue
      }
      if (normalized && totalAbs > 0) {
        value = (value / totalAbs) * 100
        s.values[i] = value
      }
      if (value >= 0) {
        s.bases![i] = positive
        positive += value
      } else {
        s.bases![i] = negative
        negative += value
      }
    }
  }
}

function computeDomain(model: ChartModel, spec: ChartSpec): [number, number] {
  let min = Infinity
  let max = -Infinity

  for (const s of model.series) {
    for (let i = 0; i < s.values.length; i++) {
      const value = s.values[i]
      if (value === null || !Number.isFinite(value)) continue
      if (s.bases) {
        // Empilhado: a base tambem faz parte do dominio, porque e o inicio
        // visivel do segmento.
        const base = s.bases[i]
        min = Math.min(min, base + value, base)
        max = Math.max(max, base + value, base)
      } else {
        min = Math.min(min, value)
        max = Math.max(max, value)
      }
    }
  }

  if (min === Infinity) {
    min = 0
    max = 1
  }

  const axis = spec.axes.y
  // Barras mentem quando o eixo não parte do zero: a comparação é pela área.
  // Todo grafico cuja leitura e por comprimento a partir de uma base precisa da
  // base no zero. Linha, dispersao e haltere ficam de fora: neles a leitura e
  // por posicao ou por distancia entre pontos.
  const needsZero =
    axis.zero ||
    spec.chart.type === 'bar' ||
    spec.chart.type === 'bar-horizontal' ||
    spec.chart.type === 'area' ||
    spec.chart.type === 'histogram' ||
    spec.chart.type === 'waffle' ||
    spec.chart.type === 'lollipop' ||
    spec.chart.type === 'bullet'

  if (needsZero) {
    min = Math.min(min, 0)
    max = Math.max(max, 0)
  }

  if (min === max) {
    const pad = Math.abs(min) || 1
    min -= pad
    max += pad
  }

  if (axis.min !== null) min = axis.min
  if (axis.max !== null) max = axis.max

  return [min, max]
}

/** Constrói o modelo a partir do spec e do dataset já transformado. */
export function buildModel(ctx: BuildContext): ChartModel {
  const { spec, dataset } = ctx
  const type = spec.chart.type

  const xColumn = spec.encoding.x ?? inferXColumn(dataset) ?? ''
  const xType = columnOf(dataset, xColumn)?.type ?? 'category'

  // Formato longo: pivota para largo antes de qualquer outra coisa.
  let working = dataset
  let seriesNames: string[]
  if (spec.encoding.series && spec.encoding.y.length > 0) {
    const pivoted = pivotLongToWide(
      dataset,
      xColumn,
      spec.encoding.series,
      spec.encoding.y[0],
    )
    working = pivoted.dataset
    seriesNames = pivoted.series
  } else {
    seriesNames =
      spec.encoding.y.length > 0
        ? spec.encoding.y
        : inferYColumns(dataset, [xColumn, spec.encoding.series, spec.encoding.size])
  }

  const categories = working.rows.map((row) => row[xColumn] ?? null)
  const locale = spec.data.locale
  const datePattern = (() => {
    if (xType !== 'date') return '%Y'
    const times = categories.filter((c): c is number => typeof c === 'number')
    if (times.length === 0) return '%Y'
    return autoDatePattern(Math.max(...times) - Math.min(...times))
  })()
  const categoryLabels = categories.map((c) => labelFor(c, xType, locale, datePattern))

  // O grafico bala compara realizado com meta: a coluna da meta precisa entrar
  // no modelo, senao ela nao existe para o renderizador nem para o dominio.
  if (
    type === 'bullet' &&
    spec.encoding.target &&
    !seriesNames.includes(spec.encoding.target)
  ) {
    seriesNames = [...seriesNames, spec.encoding.target]
  }

  const colors = resolveColors(seriesNames, ctx)
  const stacked =
    spec.chart.options.stack !== 'none' &&
    (type === 'bar' || type === 'bar-horizontal' || type === 'area')
  const normalized = stacked && spec.chart.options.stack === 'stacked100'

  const series: SeriesData[] = seriesNames.map((name, i) => ({
    name,
    color: colors[i].color,
    muted: colors[i].muted,
    values: working.rows.map((row) => {
      const value = row[name]
      return typeof value === 'number' && Number.isFinite(value) ? value : null
    }),
    rowIndexes: working.rows.map((_, index) => index),
    bases: stacked ? working.rows.map(() => 0) : undefined,
  }))

  if (stacked) applyStacking(series, normalized)

  const model: ChartModel = {
    categories,
    categoryLabels,
    xType,
    xColumn,
    series,
    yDomain: [0, 1],
    stacked,
    normalized,
  }
  model.yDomain = computeDomain(model, spec)
  return model
}

/** Todos os valores numéricos do modelo, achatados. Usado por histograma e boxplot. */
export function flatValues(model: ChartModel): number[] {
  const out: number[] = []
  for (const s of model.series) {
    for (const v of s.values) if (v !== null && Number.isFinite(v)) out.push(v)
  }
  return out
}

/** Categorias distintas com rótulo, para legendas e seletores da UI. */
export function categoryOptions(dataset: Dataset, column: string): string[] {
  return distinctValues(dataset, column).map((v) => String(v ?? ''))
}
