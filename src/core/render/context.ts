/**
 * Contrato dos renderizadores.
 *
 * Um renderizador não sabe onde a cena vai parar, não mede texto sozinho e não
 * decide cor: recebe o modelo já resolvido e o quadro já montado, e devolve
 * nós. Acrescentar um tipo de gráfico é escrever uma `ChartDefinition` e
 * registrá-la — nada no editor precisa mudar.
 */

import type { ChartSpec, ChartType, SceneNode, ScenePoint, Theme } from '../types'
import type { ChartModel, SeriesData } from '../model'
import type { CategoryScaleKind, Frame, Orientation } from '../frame'
import type { LocaleId } from '../format'

export interface DrawContext {
  spec: ChartSpec
  model: ChartModel
  theme: Theme
  frame: Frame
  locale: LocaleId
  /**
   * Registra um ponto no indice de hover da cena. Renderizadores que ja emitem
   * uma marca por observacao (barras, dispersao) nao precisam chamar: o indice
   * e preenchido automaticamente a partir dos nos com `meta`. Quem desenha uma
   * serie inteira como um unico caminho — linha e area — chama aqui, porque
   * senao nao haveria geometria por ponto em lugar nenhum.
   */
  collectPoint: (point: ScenePoint) => void
}

export type ChartGroup = 'Núcleo editorial' | 'Comparação e ranking' | 'Distribuição e composição'

export interface ChartDefinition {
  type: ChartType
  label: string
  /** Uma frase sobre quando este gráfico é a escolha certa. */
  hint: string
  group: ChartGroup
  orientation: Orientation
  /** O eixo de categorias é discreto, numérico ou temporal? */
  categoryKind: (model: ChartModel, spec: ChartSpec) => CategoryScaleKind
  /** Sem eixos nem grade (composição, treemap). */
  bare: boolean
  supportsDirectLabels: boolean
  supportsStacking: boolean
  /** Quantas colunas numéricas o gráfico usa; Infinity = todas. */
  seriesLimit: number
  /**
   * Reescreve o modelo antes de montar o quadro. Necessário para gráficos cujas
   * categorias não são as linhas da tabela: o histograma agrupa em faixas e o
   * boxplot transpõe séries em categorias.
   */
  transformModel?: (model: ChartModel, spec: ChartSpec) => ChartModel
  /** Margem esquerda extra, para rótulos desenhados pelo próprio renderizador. */
  reserveLeft?: (model: ChartModel, spec: ChartSpec, theme: Theme) => number
  /** O renderizador desenha seus próprios rótulos de categoria. */
  suppressCategoryAxis?: boolean
  /** O renderizador rotula as series por conta propria; legenda seria repeticao. */
  suppressLegend?: boolean
  draw: (ctx: DrawContext) => SceneNode[]
}

/**
 * Ordena as séries para desenho: as apagadas primeiro, para que as destacadas
 * fiquem por cima. Sem isso o destaque some atrás do cinza em gráficos densos.
 */
export function drawOrder(series: SeriesData[]): SeriesData[] {
  return [...series].sort((a, b) => Number(b.muted) - Number(a.muted))
}

/** Escala de categoria padrão: temporal se a coluna x for data, senão faixas. */
export function bandOrTime(model: ChartModel): CategoryScaleKind {
  return model.xType === 'date' ? 'time' : 'band'
}

/**
 * Cor de uma marca, considerando destaque por serie E por categoria.
 *
 * O destaque por serie ja vem resolvido no modelo. Falta o por categoria, que
 * e o caso mais comum de todos: um grafico de barras com uma coluna de valores
 * onde se quer acender uma barra so. Sem isso, "destacar" nao funcionaria
 * justamente no grafico mais usado.
 */
export function markColor(ctx: DrawContext, series: SeriesData, index: number): string {
  const label = ctx.model.categoryLabels[index]
  const highlighted = ctx.spec.highlight.categories

  // Apagada por destaque de categoria vence tudo: quem destacou uma barra quer
  // as outras em cinza, mesmo que tenha escolhido cor para elas antes.
  if (highlighted.length > 0 && !highlighted.includes(label)) {
    return ctx.theme.mutedSeries
  }

  // Cor escolhida para UMA marca específica (série + categoria). É o que o
  // popover de seleção no gráfico grava quando há várias séries e a pessoa
  // quer pintar uma única barra/coluna sem tocar nas irmãs da mesma série.
  const perMark = ctx.spec.color.overrides[`${series.name} :: ${label}`]
  if (perMark) return perMark

  // Cor escolhida para a categoria. Num gráfico de uma série só — barras com
  // uma coluna de valores, o caso mais comum — "colorir" significa colorir uma
  // barra, não a série inteira; sem isto, a escolha de cor por categoria seria
  // gravada no documento e nunca desenhada.
  if (ctx.model.series.length === 1) {
    const override = ctx.spec.color.overrides[label]
    if (override) return override
  }

  return series.color
}

/** Verdadeiro quando a marca esta apagada por qualquer um dos dois destaques. */
export function markMuted(ctx: DrawContext, series: SeriesData, index: number): boolean {
  if (series.muted) return true
  const highlighted = ctx.spec.highlight.categories
  return highlighted.length > 0 && !highlighted.includes(ctx.model.categoryLabels[index])
}
