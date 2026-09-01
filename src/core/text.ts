/**
 * Medição e quebra de texto.
 *
 * O layout precisa saber a largura real de um rótulo antes de decidir a margem
 * — é isso que separa um gráfico com respiro certo de um com rótulo cortado.
 * No navegador medimos com um canvas fora da tela; em Node (testes, geração em
 * lote) caímos num estimador por largura média de caractere, calibrado para
 * pilhas sans-serif. O erro do estimador fica em torno de 3%, suficiente para
 * margens.
 */

const cache = new Map<string, number>()

let ctx: CanvasRenderingContext2D | null | undefined

function getContext(): CanvasRenderingContext2D | null {
  if (ctx !== undefined) return ctx
  if (typeof document === 'undefined') {
    ctx = null
    return null
  }
  const canvas = document.createElement('canvas')
  ctx = canvas.getContext('2d')
  return ctx
}

/**
 * Larguras relativas ao tamanho da fonte, por classe de caractere.
 * Derivadas de Segoe UI / Helvetica, que é o que as pilhas do tema resolvem.
 */
const NARROW = new Set('ijltfrI.,:;!|\'`()[]{}-'.split(''))
const WIDE = new Set('mwMW@%'.split(''))
const UPPER = /[A-ZÀ-ÖØ-Þ0-9]/

function estimateWidth(text: string, size: number, weight: number): number {
  let units = 0
  for (const ch of text) {
    if (ch === ' ') units += 0.28
    else if (NARROW.has(ch)) units += 0.31
    else if (WIDE.has(ch)) units += 0.88
    else if (UPPER.test(ch)) units += 0.62
    else units += 0.52
  }
  // Negrito alarga cerca de 4%.
  return units * size * (weight >= 600 ? 1.04 : 1)
}

export function measureText(
  text: string,
  size: number,
  family: string,
  weight = 400,
): number {
  if (!text) return 0
  const key = `${weight}|${size}|${family}|${text}`
  const cached = cache.get(key)
  if (cached !== undefined) return cached

  let width: number
  const context = getContext()
  if (context) {
    context.font = `${weight} ${size}px ${family}`
    width = context.measureText(text).width
  } else {
    width = estimateWidth(text, size, weight)
  }

  cache.set(key, width)
  return width
}

/** Quebra o texto em linhas que caibam em `maxWidth`. Palavras longas são partidas. */
export function wrapText(
  text: string,
  maxWidth: number,
  size: number,
  family: string,
  weight = 400,
): string[] {
  if (!text) return []
  const paragraphs = text.split('\n')
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean)
    if (words.length === 0) {
      lines.push('')
      continue
    }

    let current = ''
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word
      if (measureText(candidate, size, family, weight) <= maxWidth || !current) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
      // Palavra sozinha maior que a linha: parte por caractere.
      while (measureText(current, size, family, weight) > maxWidth && current.length > 1) {
        let cut = current.length - 1
        while (cut > 1 && measureText(current.slice(0, cut), size, family, weight) > maxWidth) {
          cut--
        }
        lines.push(current.slice(0, cut))
        current = current.slice(cut)
      }
    }
    if (current) lines.push(current)
  }

  return lines
}

/** Altura de uma linha, na proporção usada em todo o projeto. */
export const LINE_HEIGHT = 1.32

export function blockHeight(lineCount: number, size: number): number {
  return lineCount * size * LINE_HEIGHT
}
