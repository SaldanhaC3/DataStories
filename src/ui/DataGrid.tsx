/**
 * Grade editável.
 *
 * Edita direto o `DataSource` — texto cru, do jeito que veio — e não o dataset
 * tipado. Assim o que você vê na grade é exatamente o que está salvo no
 * arquivo, e trocar o locale reinterpreta tudo sem perder nada.
 *
 * O cabeçalho mostra o tipo inferido de cada coluna e permite corrigi-lo: é o
 * ponto onde "1.234" vira mil e duzentos ou um e pouco, dependendo do que o
 * dado realmente é. Cada coluna também pode ser ocultada (sai do gráfico, mas
 * continua nos dados) ou excluída de vez.
 */

import { useMemo, useState } from 'react'
import type { ColumnType, DataSource } from '../core/types'
import { inferColumns } from '../core/dataset/infer'
import { useEditor } from '../state/store'

const TYPE_LABEL: Record<ColumnType, string> = {
  number: 'número',
  date: 'data',
  category: 'texto',
}

const ROWS_PER_PAGE = 50

export function DataGrid({ source }: { source: DataSource }) {
  const update = useEditor((s) => s.update)
  const hiddenColumns = useEditor((s) => s.spec.transform.hiddenColumns)
  const columns = useMemo(() => inferColumns(source), [source])
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const hidden = useMemo(() => new Set(hiddenColumns), [hiddenColumns])

  /**
   * Busca filtra só a visualização — o gráfico continua usando todas as
   * linhas, igual ao resto da navegação da grade. Serve para achar uma linha
   * numa tabela grande sem mexer no dado.
   */
  const needle = query.trim().toLowerCase()
  const matching = useMemo(() => {
    if (!needle) return null
    const hits: number[] = []
    source.rows.forEach((row, index) => {
      if (row.some((cell) => (cell ?? '').toLowerCase().includes(needle))) hits.push(index)
    })
    return hits
  }, [source.rows, needle])

  const pageRows = matching ?? source.rows.map((_, index) => index)
  const pageCount = Math.max(1, Math.ceil(pageRows.length / ROWS_PER_PAGE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = pageRows
    .slice(safePage * ROWS_PER_PAGE, (safePage + 1) * ROWS_PER_PAGE)
    .map((rowIndex) => ({ rowIndex, row: source.rows[rowIndex] }))

  const setCell = (rowIndex: number, columnIndex: number, value: string) => {
    update(
      (draft) => {
        const row = draft.data.rows[rowIndex]
        if (row) row[columnIndex] = value
      },
      { coalesceKey: `cell:${rowIndex}:${columnIndex}` },
    )
  }

  const setHeader = (columnIndex: number, value: string) => {
    update(
      (draft) => {
        const previous = draft.data.header[columnIndex]
        draft.data.header[columnIndex] = value
        // O spec aponta colunas pelo nome, então renomear precisa arrastar as
        // referências junto — senão o gráfico "perde" a série silenciosamente.
        const swap = (name: string | null) => (name === previous ? value : name)
        draft.encoding.x = swap(draft.encoding.x)
        draft.encoding.series = swap(draft.encoding.series)
        draft.encoding.size = swap(draft.encoding.size)
        draft.encoding.target = swap(draft.encoding.target)
        draft.encoding.y = draft.encoding.y.map((n) => (n === previous ? value : n))
        draft.highlight.series = draft.highlight.series.map((n) =>
          n === previous ? value : n,
        )
        if (draft.transform.sortBy === previous) draft.transform.sortBy = value
        if (previous in draft.data.overrides) {
          draft.data.overrides[value] = draft.data.overrides[previous]
          delete draft.data.overrides[previous]
        }
        draft.transform.hiddenColumns = draft.transform.hiddenColumns.map((n) =>
          n === previous ? value : n,
        )
      },
      { coalesceKey: `header:${columnIndex}` },
    )
  }

  const setType = (name: string, type: ColumnType | null) => {
    update((draft) => {
      if (type === null) delete draft.data.overrides[name]
      else draft.data.overrides[name] = type
    })
  }

  const toggleHidden = (name: string) =>
    update((draft) => {
      const list = draft.transform.hiddenColumns
      const index = list.indexOf(name)
      if (index >= 0) list.splice(index, 1)
      else list.push(name)
      // Uma coluna escondida não pode continuar alimentando o gráfico.
      draft.encoding.y = draft.encoding.y.filter((n) => n !== name)
      if (draft.encoding.x === name) draft.encoding.x = null
      if (draft.encoding.series === name) draft.encoding.series = null
    })

  const removeColumn = (columnIndex: number) => {
    const name = source.header[columnIndex]
    update((draft) => {
      draft.data.header.splice(columnIndex, 1)
      for (const row of draft.data.rows) row.splice(columnIndex, 1)
      delete draft.data.overrides[name]
      draft.encoding.y = draft.encoding.y.filter((n) => n !== name)
      if (draft.encoding.x === name) draft.encoding.x = null
      if (draft.encoding.series === name) draft.encoding.series = null
      if (draft.encoding.size === name) draft.encoding.size = null
      if (draft.encoding.target === name) draft.encoding.target = null
      if (draft.transform.sortBy === name) draft.transform.sortBy = null
      draft.transform.hiddenColumns = draft.transform.hiddenColumns.filter((n) => n !== name)
      draft.highlight.series = draft.highlight.series.filter((n) => n !== name)
    })
  }

  const addRow = () =>
    update((draft) => {
      draft.data.rows.push(draft.data.header.map(() => ''))
    })

  const addColumn = () =>
    update((draft) => {
      draft.data.header.push(`Coluna ${draft.data.header.length + 1}`)
      for (const row of draft.data.rows) row.push('')
    })

  const removeRow = (rowIndex: number) =>
    update((draft) => {
      draft.data.rows.splice(rowIndex, 1)
    })

  if (source.header.length === 0) {
    return <div className="empty">Nenhuma coluna ainda. Cole uma tabela ou suba um CSV acima.</div>
  }

  return (
    <>
      {source.rows.length > ROWS_PER_PAGE && (
        <input
          type="search"
          className="grid-search"
          placeholder="Buscar nas linhas (só afeta a visualização)…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(0)
          }}
        />
      )}
      <div className="grid-wrap">
        <table className="data-grid">
          <thead>
            <tr>
              <th className="row-index" />
              {source.header.map((name, columnIndex) => {
                const isHidden = hidden.has(name)
                return (
                  <th key={columnIndex} className={isHidden ? 'th-hidden' : undefined}>
                    <div className="col-head">
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setHeader(columnIndex, e.target.value)}
                        style={{
                          border: 0,
                          padding: 0,
                          background: 'transparent',
                          fontWeight: 700,
                          minWidth: 0,
                          flex: 1,
                        }}
                      />
                      <span className="col-actions">
                        <button
                          type="button"
                          className="col-btn"
                          title={
                            isHidden
                              ? 'Mostrar coluna de volta no gráfico'
                              : 'Ocultar coluna (some do gráfico, mas fica nos dados)'
                          }
                          onClick={() => toggleHidden(name)}
                        >
                          {isHidden ? '🚫' : '👁'}
                        </button>
                        <button
                          type="button"
                          className="col-btn danger"
                          title="Excluir coluna (apaga os dados)"
                          onClick={() => {
                            if (window.confirm(`Excluir a coluna "${name}"? Isso apaga os dados dela.`)) {
                              removeColumn(columnIndex)
                            }
                          }}
                        >
                          ×
                        </button>
                      </span>
                    </div>
                    <select
                      className="type"
                      value={source.overrides[name] ?? ''}
                      onChange={(e) => setType(name, (e.target.value || null) as ColumnType | null)}
                      style={{
                        border: 0,
                        padding: 0,
                        background: 'transparent',
                        fontSize: 10,
                        color: 'var(--muted-soft)',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        width: 'auto',
                      }}
                      title="Tipo da coluna"
                    >
                      <option value="">
                        {TYPE_LABEL[columns[columnIndex]?.type ?? 'category']} (auto)
                      </option>
                      <option value="number">número</option>
                      <option value="date">data</option>
                      <option value="category">texto</option>
                    </select>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map(({ rowIndex, row }) => (
              <tr key={rowIndex}>
                  <td
                    className="row-index"
                    onDoubleClick={() => removeRow(rowIndex)}
                    title="Clique duas vezes para remover a linha"
                  >
                    {rowIndex + 1}
                  </td>
                  {source.header.map((name, columnIndex) => (
                    <td
                      key={columnIndex}
                      className={[
                        columns[columnIndex]?.type === 'number' ? 'numeric' : undefined,
                        hidden.has(name) ? 'col-hidden' : undefined,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <input
                        type="text"
                        value={row[columnIndex] ?? ''}
                        onChange={(e) => setCell(rowIndex, columnIndex, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="row">
        <button type="button" className="btn tiny" onClick={addRow}>
          + linha
        </button>
        <button type="button" className="btn tiny" onClick={addColumn}>
          + coluna
        </button>
      </div>

      {(pageRows.length > ROWS_PER_PAGE || needle) && (
        <div className="pagination">
          <button
            type="button"
            className="btn tiny"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ←
          </button>
          <span className="inline-note">
            Página {safePage + 1} de {pageCount}
            {needle
              ? ` · ${pageRows.length} de ${source.rows.length} linhas correspondem`
              : ` · ${source.rows.length} linhas`}
          </span>
          <button
            type="button"
            className="btn tiny"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            →
          </button>
        </div>
      )}
    </>
  )
}
