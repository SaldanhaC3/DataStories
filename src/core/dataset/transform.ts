/**
 * Transformações de tabela e derivação do dataset tipado.
 *
 * `deriveDataset` é o único caminho de `DataSource` para `Dataset` usado pelo
 * resto do sistema: transpõe se preciso, infere tipos, converte células,
 * esconde, ordena e limita — nessa ordem.
 */

import type {
  CellValue,
  Column,
  Dataset,
  DataSource,
  TransformSpec,
} from '../types'
import { coerce, inferColumns } from './infer'

export const DEFAULT_TRANSFORM: TransformSpec = {
  transpose: false,
  sortBy: null,
  sortDirection: 'none',
  limit: null,
  hiddenColumns: [],
  hiddenRows: [],
}

/**
 * Troca linhas por colunas. A primeira coluna vira o novo cabeçalho, e o antigo
 * cabeçalho vira a primeira coluna — que é o que se espera de uma tabela
 * "deitada" colada de uma planilha.
 */
export function transposeSource(source: DataSource): DataSource {
  if (source.header.length === 0) return source

  const firstHeader = source.header[0]
  const newHeader = [firstHeader, ...source.rows.map((row) => row[0] ?? '')]
  const newRows: string[][] = []

  for (let col = 1; col < source.header.length; col++) {
    newRows.push([source.header[col], ...source.rows.map((row) => row[col] ?? '')])
  }

  return { ...source, header: dedupe(newHeader), rows: newRows }
}

function dedupe(names: string[]): string[] {
  const seen = new Map<string, number>()
  return names.map((name, i) => {
    let base = String(name ?? '').trim() || `Coluna ${i + 1}`
    const n = seen.get(base) ?? 0
    seen.set(base, n + 1)
    return n === 0 ? base : `${base} (${n + 1})`
  })
}

function compare(a: CellValue, b: CellValue): number {
  if (a === null && b === null) return 0
  if (a === null) return 1 // ausentes sempre no fim
  if (b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'pt-BR', { numeric: true })
}

/** Constrói o dataset tipado aplicando toda a cadeia de transformação. */
export function deriveDataset(
  source: DataSource,
  transform: TransformSpec = DEFAULT_TRANSFORM,
): Dataset {
  const working = transform.transpose ? transposeSource(source) : source
  const allColumns = inferColumns(working)

  const hidden = new Set(transform.hiddenColumns)
  const hiddenRows = new Set(transform.hiddenRows)

  const keptIndexes: number[] = []
  const columns: Column[] = []
  allColumns.forEach((column, index) => {
    if (hidden.has(column.name)) return
    keptIndexes.push(index)
    columns.push(column)
  })

  let rows: Record<string, CellValue>[] = []
  working.rows.forEach((raw, rowIndex) => {
    if (hiddenRows.has(rowIndex)) return
    const record: Record<string, CellValue> = {}
    keptIndexes.forEach((sourceIndex, i) => {
      const column = columns[i]
      record[column.name] = coerce(raw[sourceIndex] ?? '', column.type, working.locale)
    })
    rows.push(record)
  })

  if (transform.sortBy && transform.sortDirection !== 'none') {
    const key = transform.sortBy
    const sign = transform.sortDirection === 'asc' ? 1 : -1
    rows = [...rows].sort((a, b) => sign * compare(a[key], b[key]))
  }

  if (transform.limit != null && transform.limit > 0) {
    rows = rows.slice(0, transform.limit)
  }

  return { columns, rows }
}

// ---------------------------------------------------------------------------
// Consultas usadas pelos renderizadores e pelo conselheiro
// ---------------------------------------------------------------------------

export function columnOf(dataset: Dataset, name: string | null): Column | null {
  if (!name) return null
  return dataset.columns.find((c) => c.name === name) ?? null
}

export function numericColumns(dataset: Dataset): Column[] {
  return dataset.columns.filter((c) => c.type === 'number')
}

export function categoricalColumns(dataset: Dataset): Column[] {
  return dataset.columns.filter((c) => c.type === 'category')
}

export function dateColumns(dataset: Dataset): Column[] {
  return dataset.columns.filter((c) => c.type === 'date')
}

/** Valores distintos de uma coluna, na ordem em que aparecem. */
export function distinctValues(dataset: Dataset, name: string): CellValue[] {
  const seen = new Set<string>()
  const out: CellValue[] = []
  for (const row of dataset.rows) {
    const value = row[name]
    const key = String(value)
    if (!seen.has(key)) {
      seen.add(key)
      out.push(value)
    }
  }
  return out
}

export function extent(values: number[]): [number, number] {
  let min = Infinity
  let max = -Infinity
  for (const v of values) {
    if (!Number.isFinite(v)) continue
    if (v < min) min = v
    if (v > max) max = v
  }
  return min === Infinity ? [0, 1] : [min, max]
}

/**
 * Converte formato longo em largo: uma coluna por valor distinto de `series`.
 * Necessário porque os renderizadores trabalham sempre em formato largo.
 */
export function pivotLongToWide(
  dataset: Dataset,
  xColumn: string,
  seriesColumn: string,
  valueColumn: string,
): { dataset: Dataset; series: string[] } {
  const seriesNames = distinctValues(dataset, seriesColumn).map((v) => String(v ?? ''))
  const xValues = distinctValues(dataset, xColumn)
  const xType = columnOf(dataset, xColumn)?.type ?? 'category'

  const index = new Map<string, Record<string, CellValue>>()
  for (const x of xValues) {
    const record: Record<string, CellValue> = { [xColumn]: x }
    for (const name of seriesNames) record[name] = null
    index.set(String(x), record)
  }

  for (const row of dataset.rows) {
    const record = index.get(String(row[xColumn]))
    if (!record) continue
    const name = String(row[seriesColumn] ?? '')
    const value = row[valueColumn]
    record[name] = typeof value === 'number' ? value : null
  }

  return {
    dataset: {
      columns: [
        { name: xColumn, type: xType },
        ...seriesNames.map((name) => ({ name, type: 'number' as const })),
      ],
      rows: [...index.values()],
    },
    series: seriesNames,
  }
}
