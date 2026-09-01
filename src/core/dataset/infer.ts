/**
 * Interpretação de valores e inferência de tipo por coluna.
 *
 * É o ponto onde mais se erra numa ferramenta brasileira de dados: "1.234,56"
 * e "1,234.56" são o mesmo número em locales diferentes, e "03/04/2024" é
 * 3 de abril aqui e 4 de março nos EUA. O locale é declarado na fonte de dados
 * e todas as funções daqui o recebem explicitamente — nada depende do relógio
 * ou da configuração da máquina.
 */

import type { CellValue, Column, ColumnType, DataSource } from '../types'
import type { LocaleId } from '../format'

const MONTHS_PT: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
}

const MONTHS_EN: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/** Caracteres que aparecem colados a números e não fazem parte do valor. */
const NUMERIC_NOISE = /[\s R$€£¥%]/g

/**
 * Converte texto em número respeitando o locale. Devolve null quando o texto
 * não é um número — inclusive para string vazia, que vira célula ausente.
 */
export function parseNumber(raw: string, locale: LocaleId): number | null {
  if (raw == null) return null
  let s = String(raw).trim()
  if (s === '' || s === '-' || s === '—' || s === 'n/a' || s === 'N/A') return null

  // Parênteses são notação contábil de negativo: (1.234) = -1234
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }

  s = s.replace(NUMERIC_NOISE, '').replace(/−/g, '-')
  if (s === '') return null

  if (locale === 'pt-BR') {
    // Ponto é separador de milhar, vírgula é decimal.
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    s = s.replace(/,/g, '')
  }

  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return null

  const n = Number(s)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

/**
 * Converte texto em data, devolvendo epoch em ms (UTC, meia-noite).
 *
 * Usamos UTC de propósito: um gráfico não deve mudar de forma quando o leitor
 * está em outro fuso.
 */
export function parseDate(raw: string, locale: LocaleId): number | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (s === '') return null

  // ISO: 2024-03-15, 2024-03, 2024-03-15T10:00:00Z
  const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?(?:[T ]([\d:.]+)Z?)?$/)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2]) - 1
    const d = iso[3] ? Number(iso[3]) : 1
    if (m < 0 || m > 11 || d < 1 || d > 31) return null
    let ms = Date.UTC(y, m, d)
    if (iso[4]) {
      const [hh = '0', mm = '0', ss = '0'] = iso[4].split(':')
      ms += Number(hh) * 3_600_000 + Number(mm) * 60_000 + Math.floor(Number(ss) * 1000)
    }
    return ms
  }

  // Trimestre: 2024-Q1, 2024T1, Q1/2024
  const q = s.match(/^(?:(\d{4})[-\s]?[QT](\d)|[QT](\d)[/\s-](\d{4}))$/i)
  if (q) {
    const y = Number(q[1] ?? q[4])
    const quarter = Number(q[2] ?? q[3])
    if (quarter < 1 || quarter > 4) return null
    return Date.UTC(y, (quarter - 1) * 3, 1)
  }

  // Separado por barra ou ponto: 15/03/2024, 03/2024, 15.03.2024
  const parts = s.split(/[/.\-]/).map((p) => p.trim())
  if (parts.length === 3 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b, c] = parts.map(Number)
    // Ano por último (formato brasileiro e europeu) ou por primeiro (ISO curto).
    if (parts[2].length === 4) {
      const [day, month] = locale === 'pt-BR' ? [a, b] : [b, a]
      if (month < 1 || month > 12 || day < 1 || day > 31) return null
      return Date.UTC(c, month - 1, day)
    }
    if (parts[0].length === 4) {
      if (b < 1 || b > 12) return null
      return Date.UTC(a, b - 1, c)
    }
    // Ano de dois dígitos: 15/03/24
    const [day, month] = locale === 'pt-BR' ? [a, b] : [b, a]
    if (month < 1 || month > 12) return null
    return Date.UTC(c < 70 ? 2000 + c : 1900 + c, month - 1, day)
  }

  if (parts.length === 2 && parts.every((p) => /^\d+$/.test(p))) {
    const [a, b] = parts.map(Number)
    // 03/2024 (mês/ano) ou 2024/03 (ano/mês)
    if (parts[1].length === 4 && a >= 1 && a <= 12) return Date.UTC(b, a - 1, 1)
    if (parts[0].length === 4 && b >= 1 && b <= 12) return Date.UTC(a, b - 1, 1)
    return null
  }

  // Nome de mês: "jan/2024", "março 2024", "Mar 2024", "15 de março de 2024"
  const named = s
    .toLowerCase()
    .replace(/\bde\b/g, ' ')
    .replace(/[/,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)

  if (named.length >= 2 && named.length <= 3) {
    const table = locale === 'pt-BR' ? MONTHS_PT : MONTHS_EN
    let month: number | null = null
    let year: number | null = null
    let day: number | null = null

    for (const token of named) {
      const key = token.slice(0, 3)
      if (key in table && month === null) {
        month = table[key]
      } else if (/^\d{4}$/.test(token)) {
        year = Number(token)
      } else if (/^\d{1,2}$/.test(token)) {
        day = Number(token)
      }
    }
    if (month !== null && year !== null) {
      return Date.UTC(year, month, day ?? 1)
    }
  }

  return null
}

/** Quantos valores de uma amostra passam num interpretador. */
function successRate(
  values: string[],
  parse: (v: string) => unknown | null,
): number {
  if (values.length === 0) return 0
  let ok = 0
  for (const v of values) if (parse(v) !== null) ok++
  return ok / values.length
}

/**
 * Infere o tipo de uma coluna a partir de uma amostra.
 *
 * Números vêm antes de datas de propósito: um ano isolado ("2024") é mais útil
 * como número — a escala linear resultante fica mais limpa do que uma escala
 * temporal com um ponto por ano.
 */
export function inferColumnType(
  values: string[],
  locale: LocaleId,
  threshold = 0.85,
): ColumnType {
  const sample = values
    .filter((v) => v != null && String(v).trim() !== '')
    .slice(0, 400)

  if (sample.length === 0) return 'category'

  if (successRate(sample, (v) => parseNumber(v, locale)) >= threshold) {
    return 'number'
  }
  if (successRate(sample, (v) => parseDate(v, locale)) >= threshold) {
    return 'date'
  }
  return 'category'
}

/** Converte uma célula de texto no valor do tipo declarado. */
export function coerce(
  raw: string,
  type: ColumnType,
  locale: LocaleId,
): CellValue {
  if (raw == null || String(raw).trim() === '') return null
  switch (type) {
    case 'number':
      return parseNumber(raw, locale)
    case 'date':
      return parseDate(raw, locale)
    case 'category':
      return String(raw).trim()
  }
}

/** Descobre os tipos de todas as colunas, respeitando as fixações manuais. */
export function inferColumns(source: DataSource): Column[] {
  return source.header.map((name, index) => {
    const override = source.overrides[name]
    if (override) return { name, type: override }
    const values = source.rows.map((row) => row[index] ?? '')
    return { name, type: inferColumnType(values, source.locale) }
  })
}
