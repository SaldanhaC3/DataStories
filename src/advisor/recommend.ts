/**
 * Recomendação de tipo de gráfico a partir da forma dos dados.
 *
 * Não é adivinhação estatística: é a mesma árvore de decisão que um editor de
 * infografia percorre. Quantas categorias? Quantas séries? O eixo x é tempo?
 * Os valores somam um todo? Cada resposta descarta metade das opções.
 */

import type { ChartType, Dataset } from '../core/types'
import { getChartDefinition } from '../core/render'

export interface Recommendation {
  type: ChartType
  label: string
  /** Por que este gráfico serve para estes dados, em uma frase. */
  reason: string
  /** 0..1, usado só para ordenar. */
  score: number
}

export interface DataShape {
  rows: number
  numericColumns: number
  categoryColumns: number
  dateColumns: number
  hasTime: boolean
  /** Valores somam algo próximo de 100: sinal forte de composição. */
  looksLikeShares: boolean
  allPositive: boolean
}

export function describeShape(dataset: Dataset): DataShape {
  const numeric = dataset.columns.filter((c) => c.type === 'number')
  const dates = dataset.columns.filter((c) => c.type === 'date')
  const categories = dataset.columns.filter((c) => c.type === 'category')

  let allPositive = true
  let firstColumnSum = 0
  const first = numeric[0]?.name

  for (const row of dataset.rows) {
    for (const column of numeric) {
      const value = row[column.name]
      if (typeof value === 'number' && value < 0) allPositive = false
    }
    if (first) {
      const value = row[first]
      if (typeof value === 'number') firstColumnSum += value
    }
  }

  return {
    rows: dataset.rows.length,
    numericColumns: numeric.length,
    categoryColumns: categories.length,
    dateColumns: dates.length,
    hasTime: dates.length > 0,
    looksLikeShares:
      numeric.length === 1 &&
      allPositive &&
      Math.abs(firstColumnSum - 100) < 2 &&
      dataset.rows.length > 1,
    allPositive,
  }
}

/** Devolve as sugestões em ordem, da mais adequada para a menos. */
export function recommend(dataset: Dataset): Recommendation[] {
  const shape = describeShape(dataset)
  const out: Array<Omit<Recommendation, 'label'>> = []

  const push = (type: ChartType, score: number, reason: string) =>
    out.push({ type, score, reason })

  if (dataset.rows.length === 0 || shape.numericColumns === 0) {
    push('bar', 0.5, 'Ponto de partida seguro enquanto os dados não têm colunas numéricas.')
  }

  // Série temporal
  if (shape.hasTime) {
    if (shape.rows > 12) {
      push('line', 0.98, 'Muitos pontos no tempo: a linha mostra a trajetória sem virar floresta de barras.')
      push('area', 0.7, 'Se o assunto for volume acumulado e não taxa, a área comunica melhor.')
    } else {
      push('bar', 0.85, 'Poucos períodos: barras deixam comparar valores exatos.')
      push('line', 0.8, 'A linha enfatiza a tendência em vez dos valores individuais.')
    }
    if (shape.numericColumns === 2 && shape.rows <= 2) {
      push('slope', 0.9, 'Dois momentos: a inclinação vira a própria mensagem.')
    }
  }

  // Composição
  if (shape.looksLikeShares || (shape.numericColumns === 1 && shape.allPositive && !shape.hasTime)) {
    if (shape.rows <= 4) {
      push('donut', 0.8, 'Poucas partes de um todo: a rosca funciona nesse limite.')
      push('waffle', 0.85, 'Células contáveis: proporção sem a distorção do ângulo.')
    } else if (shape.rows <= 12) {
      push('waffle', 0.7, 'Composição com algumas partes; evita a pizza ilegível.')
      push('treemap', 0.72, 'Muitas partes de tamanhos bem diferentes.')
    } else {
      push('treemap', 0.75, 'Composição com muitas partes: o treemap aproveita a área toda.')
    }
  }

  // Comparação entre categorias
  if (!shape.hasTime && shape.categoryColumns >= 1) {
    if (shape.numericColumns === 2) {
      push('dumbbell', 0.92, 'Duas medidas por categoria: o haltere mostra a diferença, não só os níveis.')
      push('bullet', 0.6, 'Se a segunda coluna for uma meta, o gráfico bala é mais direto.')
    }
    if (shape.rows > 7) {
      push('bar-horizontal', 0.95, 'Muitas categorias com nome: barras horizontais dispensam girar rótulo.')
      push('lollipop', 0.7, 'Mesmo ranking com menos tinta.')
    } else {
      push('bar', 0.9, 'Poucas categorias: barras verticais são a leitura mais direta.')
      push('bar-horizontal', 0.8, 'Se os nomes forem longos, prefira a horizontal.')
    }
  }

  // Relação entre variáveis
  if (shape.numericColumns >= 2 && shape.categoryColumns === 0 && !shape.hasTime) {
    push('scatter', 0.9, 'Duas variáveis numéricas: a dispersão revela a relação entre elas.')
  }

  // Distribuição
  if (shape.numericColumns === 1 && shape.rows > 25) {
    push('histogram', 0.8, 'Muitas observações de uma variável: vale ver como elas se distribuem.')
  }
  if (shape.numericColumns > 2 && shape.rows > 15) {
    push('boxplot', 0.65, 'Várias variáveis com muitas observações: compare as dispersões.')
  }

  // Matriz: muitas medidas por categoria é a forma de um mapa de calor.
  if (shape.numericColumns >= 3 && shape.rows >= 3 && shape.categoryColumns >= 1) {
    push('heatmap', 0.88, 'Várias medidas por categoria: a matriz de calor mostra o padrão inteiro de uma vez.')
  }

  // Um número só na mesa: o herói de abertura de matéria.
  if (shape.numericColumns >= 1 && shape.rows === 1) {
    push('big-number', 0.93, 'Uma linha de dados: o número em destaque com contexto diz mais que qualquer eixo.')
  }

  // Deduplica mantendo a maior pontuação de cada tipo.
  const best = new Map<ChartType, Omit<Recommendation, 'label'>>()
  for (const item of out) {
    const current = best.get(item.type)
    if (!current || item.score > current.score) best.set(item.type, item)
  }

  return [...best.values()]
    .sort((a, b) => b.score - a.score)
    .map((item) => ({ ...item, label: getChartDefinition(item.type).label }))
}
