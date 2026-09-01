/**
 * Modelo de documento do DataStories.
 *
 * Duas ideias governam este arquivo:
 *
 * 1. O `ChartSpec` é o documento inteiro. Ele é JSON puro, serializável, e
 *    descreve dados, transformações, codificação visual, tema, anotações e
 *    textos. Salvar, exportar e embutir o gráfico é sempre salvar este objeto.
 *
 * 2. Renderizadores não desenham no DOM. Eles devolvem uma `Scene`: uma árvore
 *    de nós geométricos. O editor React, o exportador SVG e o embed estático
 *    são três consumidores diferentes da mesma cena.
 */

// ---------------------------------------------------------------------------
// Dados
// ---------------------------------------------------------------------------

export type ColumnType = 'number' | 'date' | 'category'

/** Valor de célula já interpretado. Datas viram epoch ms para manter o JSON limpo. */
export type CellValue = number | string | null

export interface Column {
  name: string
  type: ColumnType
}

/**
 * Fonte de dados crua. Guardamos o texto das células, não os valores
 * interpretados: a inferência de tipo é determinística e roda em cima disto,
 * então a grade editável e o arquivo salvo compartilham a mesma verdade.
 */
export interface DataSource {
  header: string[]
  rows: string[][]
  /** Tipos fixados manualmente pelo usuário, sobrepondo a inferência. */
  overrides: Record<string, ColumnType>
  /** Afeta separador decimal e formatos de data aceitos. */
  locale: 'pt-BR' | 'en-US'
}

/** Dataset interpretado, derivado de `DataSource` pela inferência de tipos. */
export interface Dataset {
  columns: Column[]
  rows: Record<string, CellValue>[]
}

export type SortDirection = 'asc' | 'desc' | 'none'

export interface TransformSpec {
  /** Troca linhas por colunas. Útil quando a tabela vem "deitada". */
  transpose: boolean
  sortBy: string | null
  sortDirection: SortDirection
  /** Mantém apenas as N primeiras linhas após a ordenação. */
  limit: number | null
  hiddenColumns: string[]
  hiddenRows: number[]
}

// ---------------------------------------------------------------------------
// Gráfico
// ---------------------------------------------------------------------------

export type ChartType =
  | 'bar'
  | 'bar-horizontal'
  | 'line'
  | 'area'
  | 'scatter'
  | 'dumbbell'
  | 'slope'
  | 'lollipop'
  | 'bullet'
  | 'histogram'
  | 'boxplot'
  | 'donut'
  | 'waffle'
  | 'treemap'

export type StackMode = 'none' | 'stacked' | 'stacked100'
export type CurveMode = 'linear' | 'smooth' | 'step'

export interface ChartOptions {
  stack: StackMode
  curve: CurveMode
  /** Espessura da linha e da borda das marcas, em px. */
  strokeWidth: number
  /** Mostra marcadores de ponto sobre a linha. */
  showPoints: boolean
  /** Preenchimento sob a linha, 0..1. Usado por `area`. */
  fillOpacity: number
  /** Espaçamento entre barras, 0..1. */
  barPadding: number
  /** Raio interno do donut, fração do raio externo. */
  innerRadius: number
  /** Número de faixas do histograma; null = regra de Freedman–Diaconis. */
  bins: number | null
  /** Total de células do waffle. */
  waffleCells: number
  /** Raio dos pontos de dispersão/dumbbell, em px. */
  pointRadius: number
}

/**
 * Mapeamento de colunas para papéis visuais.
 *
 * Dois formatos de dados são aceitos:
 * - largo: `x` + várias colunas em `y` (uma série por coluna);
 * - longo: `x` + uma coluna `y` + coluna `series` com o nome da série.
 */
export interface Encoding {
  x: string | null
  y: string[]
  series: string | null
  size: string | null
  label: string | null
  /** Coluna de valor alvo do gráfico `bullet`. */
  target: string | null
}

export interface AxisSpec {
  title: string
  min: number | null
  max: number | null
  /** Força o eixo a incluir o zero. Ligado por padrão em barras. */
  zero: boolean
  grid: boolean
  ticks: number | null
  /** Especificador d3-format, ex.: ",.1f". */
  format: string | null
  /** Sufixo colado ao último tick, ex.: "%" ou "mil". */
  unit: string
  visible: boolean
  /** Escala logarítmica. Ignorada quando há valores <= 0. */
  log: boolean
}

export type PaletteKind = 'categorical' | 'sequential' | 'diverging' | 'single'

export interface ColorSpec {
  kind: PaletteKind
  /** Cores explícitas por série/categoria. Vence a paleta do tema. */
  overrides: Record<string, string>
  /** Inverte a ordem da paleta. */
  reverse: boolean
}

/**
 * Ênfase editorial: as séries/categorias listadas recebem cor, todo o resto
 * vai para cinza. É a alavanca mais forte do storytelling.
 */
export interface HighlightSpec {
  series: string[]
  categories: string[]
}

export interface LabelSpec {
  /** Rótulo colado na própria marca, substituindo a legenda. */
  directLabels: boolean
  legend: 'auto' | 'off' | 'top'
  /** Número impresso sobre cada marca. */
  valueLabels: boolean
  /** Rótulo direto apenas nas séries destacadas. */
  labelHighlightedOnly: boolean
}

// ---------------------------------------------------------------------------
// Anotações
// ---------------------------------------------------------------------------

export interface TextAnnotation {
  id: string
  kind: 'text'
  text: string
  /** Posição em fração da área de plotagem (0..1), para sobreviver a resize. */
  x: number
  y: number
  align: 'left' | 'center' | 'right'
  size: number
  bold: boolean
  color: string | null
  /** Caixa clara atrás do texto, para leitura sobre marcas densas. */
  background: boolean
  connector: {
    enabled: boolean
    /** Alvo da seta, também em fração da área de plotagem. */
    tx: number
    ty: number
    arrow: boolean
  }
}

/** Faixa sombreada cobrindo um intervalo de um eixo (ex.: um período). */
export interface RangeAnnotation {
  id: string
  kind: 'range'
  axis: 'x' | 'y'
  from: string
  to: string
  label: string
  color: string | null
}

/** Linha de referência: meta, média, marco temporal. */
export interface LineAnnotation {
  id: string
  kind: 'line'
  axis: 'x' | 'y'
  value: string
  label: string
  dash: boolean
  color: string | null
}

/** Destaque de um ponto específico com rótulo e valor. */
export interface PointAnnotation {
  id: string
  kind: 'point'
  series: string
  rowIndex: number
  label: string
  showValue: boolean
  color: string | null
}

export type Annotation =
  | TextAnnotation
  | RangeAnnotation
  | LineAnnotation
  | PointAnnotation

// ---------------------------------------------------------------------------
// Tema e textos
// ---------------------------------------------------------------------------

export interface ThemeTokens {
  background: string
  foreground: string
  /** Cor de textos secundários: subtítulo, ticks, rodapé. */
  muted: string
  grid: string
  axis: string
  /** Cor das séries não destacadas. */
  mutedSeries: string
  fontFamily: string
  titleFamily: string
  titleSize: number
  titleWeight: number
  subtitleSize: number
  labelSize: number
  footerSize: number
  palette: string[]
  sequential: string[]
  diverging: string[]
  accent: string
  /** Filete colorido acima do título, marca do estilo editorial. */
  rule: boolean
}

export interface Theme extends ThemeTokens {
  id: string
  name: string
  description: string
}

export interface TextSpec {
  title: string
  subtitle: string
  source: string
  sourceUrl: string
  note: string
  credit: string
}

export interface LayoutSpec {
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Documento
// ---------------------------------------------------------------------------

export const SPEC_VERSION = 1 as const

export interface ChartSpec {
  specVersion: typeof SPEC_VERSION
  id: string
  chart: { type: ChartType; options: ChartOptions }
  data: DataSource
  transform: TransformSpec
  encoding: Encoding
  axes: { x: AxisSpec; y: AxisSpec }
  color: ColorSpec
  highlight: HighlightSpec
  labels: LabelSpec
  annotations: Annotation[]
  text: TextSpec
  theme: { id: string; overrides: Partial<ThemeTokens> }
  layout: LayoutSpec
}

// ---------------------------------------------------------------------------
// Cena
// ---------------------------------------------------------------------------

/** Rastro de origem de uma marca, para clique-para-destacar e tooltip. */
export interface MarkMeta {
  series: string
  rowIndex: number
  category: string
  value: number
}

export interface SceneBase {
  meta?: MarkMeta
  opacity?: number
  /** Identificador estável usado pelo editor para seleção. */
  handle?: string
}

export interface RectNode extends SceneBase {
  t: 'rect'
  x: number
  y: number
  w: number
  h: number
  fill: string
  rx?: number
  stroke?: string
  strokeWidth?: number
}

export interface PathNode extends SceneBase {
  t: 'path'
  d: string
  fill?: string
  stroke?: string
  strokeWidth?: number
  dash?: string
  linecap?: 'butt' | 'round' | 'square'
  linejoin?: 'miter' | 'round' | 'bevel'
}

export interface LineNode extends SceneBase {
  t: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
  stroke: string
  strokeWidth?: number
  dash?: string
  linecap?: 'butt' | 'round' | 'square'
}

export interface CircleNode extends SceneBase {
  t: 'circle'
  cx: number
  cy: number
  r: number
  fill: string
  stroke?: string
  strokeWidth?: number
}

export interface TextNode extends SceneBase {
  t: 'text'
  x: number
  y: number
  text: string
  fill: string
  size: number
  weight?: number
  family?: string
  anchor?: 'start' | 'middle' | 'end'
  /** Alinhamento vertical. "middle" centra na coordenada y. */
  baseline?: 'auto' | 'middle' | 'hanging'
  /** Halo da cor do fundo, para texto legível sobre marcas. */
  halo?: string
  haloWidth?: number
  letterSpacing?: number
}

export interface GroupNode extends SceneBase {
  t: 'g'
  children: SceneNode[]
  transform?: string
  /** Recorta o grupo à área de plotagem. */
  clip?: boolean
}

export type SceneNode =
  | RectNode
  | PathNode
  | LineNode
  | CircleNode
  | TextNode
  | GroupNode

export interface PlotArea {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Um ponto de dado com sua posicao final na cena.
 *
 * Existe para o editor responder "que numero e esse?" sob o cursor sem precisar
 * de um no de DOM por observacao. Num grafico de linha com 20 mil pontos, o
 * caminho antigo — um circulo transparente por ponto, so para receber o hover —
 * custava 60 mil elementos e 380ms de render. Aqui a mesma informacao e um
 * array simples, que nao entra no SVG nem no arquivo exportado.
 */
export interface ScenePoint {
  series: string
  category: string
  value: number
  rowIndex: number
  x: number
  y: number
}

export interface Scene {
  width: number
  height: number
  background: string
  plot: PlotArea
  nodes: SceneNode[]
  /** Series efetivamente desenhadas, para legenda e interacao. */
  series: SeriesInfo[]
  /** Rotulos de categoria, na ordem em que foram desenhados. */
  categories: string[]
  /** Indice de pontos para tooltip e navegacao por teclado. Nao e desenhado. */
  points: ScenePoint[]
}

/** Item de legenda emitido pelos renderizadores para a UI reaproveitar. */
export interface SeriesInfo {
  name: string
  color: string
  muted: boolean
}

export interface RenderResult {
  nodes: SceneNode[]
  series: SeriesInfo[]
}
