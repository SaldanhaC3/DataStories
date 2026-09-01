/**
 * Entrada de dados: texto colado, arquivo CSV/TSV ou grade editada.
 *
 * A saída é sempre um `DataSource` — matriz de texto + cabeçalho. A conversão
 * para valores tipados acontece depois, em `infer.ts`, para que a grade
 * editável e o arquivo salvo continuem sendo a mesma coisa.
 */

import Papa from 'papaparse'
import type { DataSource } from '../types'
import type { LocaleId } from '../format'

export interface ParseOptions {
  /** Quando ausente, o delimitador é detectado. */
  delimiter?: string
  locale?: LocaleId
  /** Quando falso, gera cabeçalhos "Coluna 1", "Coluna 2"... */
  hasHeader?: boolean
}

const CANDIDATE_DELIMITERS = [',', ';', '\t', '|']

/**
 * Detecta o delimitador pela consistência do número de campos por linha.
 * Vence o candidato que produz mais colunas mantendo a contagem estável —
 * um separador errado quase sempre gera linhas de larguras diferentes.
 */
export function detectDelimiter(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .slice(0, 20)
  if (lines.length === 0) return ','

  let best = ','
  let bestScore = -1

  for (const delimiter of CANDIDATE_DELIMITERS) {
    const counts = lines.map((line) => splitRespectingQuotes(line, delimiter).length)
    const first = counts[0]
    if (first < 2) continue
    const consistent = counts.every((c) => c === first)
    const score = (consistent ? 1000 : 0) + first
    if (score > bestScore) {
      bestScore = score
      best = delimiter
    }
  }
  return best
}

function splitRespectingQuotes(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out
}

/**
 * Adivinha o locale numérico do texto.
 *
 * A pista decisiva é o padrão "1.234,56": ponto seguido de exatamente três
 * dígitos e depois vírgula. Na dúvida assume pt-BR, que é o público desta
 * ferramenta.
 */
export function detectLocale(text: string): LocaleId {
  const sample = text.slice(0, 20_000)
  const brStyle = (sample.match(/\d{1,3}(?:\.\d{3})+,\d/g) ?? []).length
  const usStyle = (sample.match(/\d{1,3}(?:,\d{3})+\.\d/g) ?? []).length
  if (usStyle > brStyle) return 'en-US'
  if (brStyle > 0) return 'pt-BR'

  // Sem separador de milhar: decide pelo separador decimal solto.
  const brDecimal = (sample.match(/\d+,\d{1,2}(?!\d)/g) ?? []).length
  const usDecimal = (sample.match(/\d+\.\d{1,2}(?!\d)/g) ?? []).length
  return usDecimal > brDecimal ? 'en-US' : 'pt-BR'
}

function uniqueHeader(raw: string[]): string[] {
  const seen = new Map<string, number>()
  return raw.map((name, index) => {
    let base = String(name ?? '').trim()
    if (base === '') base = `Coluna ${index + 1}`
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} (${count + 1})`
  })
}

/** Converte texto delimitado num `DataSource`. */
export function parseDelimited(text: string, options: ParseOptions = {}): DataSource {
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trimEnd()
  const delimiter = options.delimiter ?? detectDelimiter(cleaned)
  const locale = options.locale ?? detectLocale(cleaned)

  const result = Papa.parse<string[]>(cleaned, {
    delimiter,
    skipEmptyLines: 'greedy',
    header: false,
  })

  const matrix = (result.data as string[][]).map((row) =>
    row.map((cell) => (cell ?? '').trim()),
  )

  if (matrix.length === 0) {
    return { header: [], rows: [], overrides: {}, locale }
  }

  const hasHeader = options.hasHeader ?? looksLikeHeader(matrix)
  const width = Math.max(...matrix.map((r) => r.length))
  const pad = (row: string[]) =>
    Array.from({ length: width }, (_, i) => row[i] ?? '')

  if (hasHeader) {
    return {
      header: uniqueHeader(pad(matrix[0])),
      rows: matrix.slice(1).map(pad),
      overrides: {},
      locale,
    }
  }

  return {
    header: uniqueHeader(Array.from({ length: width }, (_, i) => `Coluna ${i + 1}`)),
    rows: matrix.map(pad),
    overrides: {},
    locale,
  }
}

/**
 * A primeira linha é cabeçalho?
 *
 * A regra é por eliminação, e não por acumulação de indícios: só existe um
 * caso em que a primeira linha claramente NÃO é cabeçalho — quando ela é
 * numérica em todas as colunas e o corpo também é. Fora disso, assume-se
 * cabeçalho, porque tabela colada de planilha quase sempre tem um.
 *
 * A versão anterior somava evidências por coluna e errava num caso muito
 * comum: cabeçalhos que são anos ("Cidade;2019;2024") pareciam dados
 * numéricos e derrubavam a contagem.
 */
function looksLikeHeader(matrix: string[][]): boolean {
  if (matrix.length < 2) return true

  const first = matrix[0]
  const rest = matrix.slice(1, 8)
  const numericish = (cell: string) =>
    /\d/.test(cell ?? '') && /^[\d.,\-+ R$%()]+$/.test(cell ?? '')

  const everyHeaderNumeric = first.every(numericish)
  if (!everyHeaderNumeric) return true

  const everyColumnNumericInBody = first.every((_, col) =>
    rest.some((row) => numericish(row[col] ?? '')),
  )
  return !everyColumnNumericInBody
}

/** Cria uma tabela vazia com o tamanho pedido, para a grade em branco. */
export function emptySource(columns = 3, rows = 5): DataSource {
  return {
    header: Array.from({ length: columns }, (_, i) =>
      i === 0 ? 'Categoria' : `Série ${i}`,
    ),
    rows: Array.from({ length: rows }, () => Array.from({ length: columns }, () => '')),
    overrides: {},
    locale: 'pt-BR',
  }
}

/** Serializa de volta para CSV — usado no export e nos exemplos. */
export function toCSV(source: DataSource, delimiter = ','): string {
  const escape = (cell: string) =>
    /["\n]|[,;\t|]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell

  const lines = [source.header.map(escape).join(delimiter)]
  for (const row of source.rows) {
    lines.push(row.map((c) => escape(c ?? '')).join(delimiter))
  }
  return lines.join('\n')
}
