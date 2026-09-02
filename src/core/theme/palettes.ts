/**
 * Paletas com curadoria.
 *
 * O que da para garantir, e o que nao da — os numeros abaixo sao verificados em
 * `tests/render.test.ts` e valem para as quatro paletas categoricas:
 *
 * - As tres primeiras cores ficam distinguiveis nas tres deficiencias de visao
 *   de cor (distancia CIE76 acima de 9,5 depois da simulacao).
 * - Ate a quarta cor, protanopia e deuteranopia — que juntas respondem por
 *   praticamente toda a prevalencia, cerca de 8% dos homens — ficam acima de
 *   8,5.
 * - Toda cor alcanca ao menos 3:1 de contraste contra o fundo do tema a que
 *   pertence, para que uma linha fina naquela cor nao suma.
 * - Da quinta cor em diante, tritanopia perde pares quentes: laranja e dourado
 *   convergem. Nenhuma paleta categorica de oito cores escapa disso, incluindo
 *   a Okabe-Ito, que e o padrao academico.
 *
 * A conclusao pratica esta embutida no linter: acima de seis series a resposta
 * nao e uma paleta melhor, e destacar uma ou duas e mandar o resto para o cinza.
 *
 * A ordem das cores importa: as primeiras posicoes sao as mais distintas entre
 * si, porque a maioria dos graficos usa duas ou tres series.
 */

import { mix } from './contrast'

export interface Palette {
  id: string
  name: string
  kind: 'categorical' | 'sequential' | 'diverging'
  colors: string[]
}

// ---------------------------------------------------------------------------
// Categóricas
// ---------------------------------------------------------------------------

/** Padrão do tema Editorial. Azul/laranja primeiro: o par mais seguro que existe. */
export const EDITORIAL: string[] = [
  '#1A6BA8',
  '#E2603B',
  '#118A72',
  '#A8447C',
  '#C08A1E',
  '#6E4B8F',
  '#7A8794',
  '#2E3B45',
]

/**
 * Derivada da Okabe-Ito, o conjunto de referencia para daltonismo, com duas
 * trocas justificadas: o amarelo original (#F0E442) e o azul-ceu (#56B4E9)
 * ficam abaixo de 3:1 contra o branco, o que faz linha fina sumir no papel.
 * Foram substituidos por um dourado escuro e por um roxo.
 */
export const ACCESSIBLE: string[] = [
  '#0072B2',
  '#D55E00',
  '#009E73',
  '#CC79A7',
  '#B58900',
  '#7B5EA7',
  '#8C6D3F',
  '#3A3A3A',
]

/** Inspirada no visual do Financial Times, sobre fundo rosado. */
export const NEWSROOM: string[] = [
  '#0F5499',
  '#990F3D',
  '#0D7680',
  '#593380',
  '#B85C00',
  '#3D6B1A',
  '#66605C',
  '#262A33',
]

/** Para fundo escuro: mais claras e saturadas, para segurar contraste. */
export const NOCTURNE: string[] = [
  '#5AA9F0',
  '#FF8A5B',
  '#4ECDA4',
  '#E88AC0',
  '#E8C35A',
  '#C9B6FF',
  '#8FA3B5',
  '#D8DEE6',
]

/**
 * "Palma": verdes e amarelos de baixa saturação, para poucas categorias sem
 * ordem. As cores conversam entre si em vez de competir — o gráfico fica
 * calmo mesmo com as quatro cores acesas.
 */
export const PALM: string[] = [
  '#3E7A5E',
  '#A8A23C',
  '#6E9A7C',
  '#C2B25A',
  '#2E5B47',
  '#8C846A',
  '#4F8A6E',
  '#D0C98F',
]

/**
 * "Arame": tons neutros com um único ponto focal laranja na primeira posição.
 * Pensada para o destaque editorial mais forte que existe: tudo discreto, uma
 * coisa só acesa. As posições seguintes alternam matizes frios e quentes para
 * continuarem distinguíveis sob daltonismo, e todas passam de 3:1 contra o
 * fundo do tema Foco — as duas coisas verificadas pelo teste de cor.
 */
export const WIRE: string[] = [
  '#E8490D',
  '#5B7A99',
  '#9C8468',
  '#2F4359',
  '#7A8598',
  '#5C5248',
  '#3A4149',
  '#2B2F35',
]

// ---------------------------------------------------------------------------
// Sequenciais e divergentes
// ---------------------------------------------------------------------------

export const SEQ_BLUE: string[] = [
  '#EDF3F9',
  '#CFE0EE',
  '#A9C8E0',
  '#7FADD1',
  '#5590C0',
  '#2E71A8',
  '#1A5488',
  '#0D3862',
]

export const SEQ_WARM: string[] = [
  '#FDF1E7',
  '#FADCC4',
  '#F5C09A',
  '#EDA070',
  '#E07E4C',
  '#C85F33',
  '#A44523',
  '#752E16',
]

export const SEQ_GREEN: string[] = [
  '#EDF6F1',
  '#CDE7DA',
  '#A5D4BE',
  '#77BC9E',
  '#4CA07E',
  '#2C8261',
  '#1A6448',
  '#0E4430',
]

/** "Porcelana": azul-céu monotomático, claro para escuro. */
export const SEQ_PORCELAIN: string[] = [
  '#EEF4F8',
  '#D3E3EE',
  '#ADCFE2',
  '#82B6D1',
  '#5C9BBE',
  '#3A7FA8',
  '#25648C',
  '#154767',
]

export const DIV_RED_BLUE: string[] = [
  '#A32D3F',
  '#C75F6B',
  '#E19AA1',
  '#F2D6D8',
  '#F0F0F0',
  '#D3E0EC',
  '#9DBEDA',
  '#5D8FBE',
  '#1F5F97',
]

export const DIV_BROWN_TEAL: string[] = [
  '#8C5109',
  '#BE802B',
  '#DDBE72',
  '#F1E3B8',
  '#F0F0F0',
  '#C3E5E1',
  '#7FC5BC',
  '#379089',
  '#01605A',
]

export const PALETTES: Palette[] = [
  { id: 'editorial', name: 'Editorial', kind: 'categorical', colors: EDITORIAL },
  { id: 'accessible', name: 'Acessível', kind: 'categorical', colors: ACCESSIBLE },
  { id: 'newsroom', name: 'Redação', kind: 'categorical', colors: NEWSROOM },
  { id: 'nocturne', name: 'Noturna', kind: 'categorical', colors: NOCTURNE },
  { id: 'palm', name: 'Palma', kind: 'categorical', colors: PALM },
  { id: 'wire', name: 'Arame', kind: 'categorical', colors: WIRE },
  { id: 'seq-blue', name: 'Azul sequencial', kind: 'sequential', colors: SEQ_BLUE },
  { id: 'seq-warm', name: 'Quente sequencial', kind: 'sequential', colors: SEQ_WARM },
  { id: 'seq-green', name: 'Verde sequencial', kind: 'sequential', colors: SEQ_GREEN },
  { id: 'seq-porcelain', name: 'Porcelana', kind: 'sequential', colors: SEQ_PORCELAIN },
  { id: 'div-red-blue', name: 'Vermelho–Azul', kind: 'diverging', colors: DIV_RED_BLUE },
  { id: 'div-brown-teal', name: 'Marrom–Verde-água', kind: 'diverging', colors: DIV_BROWN_TEAL },
]

/**
 * Amostra `count` cores de uma rampa, interpolando quando se pede mais cores do
 * que a rampa tem. Para paletas categóricas o certo é repetir com variação, não
 * interpolar — daí o parâmetro `interpolate`.
 */
export function sampleRamp(ramp: string[], count: number): string[] {
  if (count <= 0) return []
  if (count === 1) return [ramp[Math.floor(ramp.length / 2)]]

  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const pos = (i / (count - 1)) * (ramp.length - 1)
    const lo = Math.floor(pos)
    const hi = Math.min(ramp.length - 1, lo + 1)
    out.push(mix(ramp[lo], ramp[hi], pos - lo))
  }
  return out
}

/**
 * Cores para N séries categóricas. Além do tamanho da paleta, escurece e
 * clareia ciclicamente em vez de repetir a mesma cor.
 */
export function categorical(palette: string[], count: number): string[] {
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const base = palette[i % palette.length]
    const cycle = Math.floor(i / palette.length)
    if (cycle === 0) {
      out.push(base)
    } else if (cycle % 2 === 1) {
      out.push(mix(base, '#ffffff', 0.35))
    } else {
      out.push(mix(base, '#000000', 0.3))
    }
  }
  return out
}
