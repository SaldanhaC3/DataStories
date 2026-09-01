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
  const hiddenRows = useEditor((s) => s.spec.transform.hiddenRows)
  const columns = useMemo(() => inferColumns(source), [source])
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const hidden = useMemo(() => new Set(hiddenColumns), [hiddenColumns])
  const hiddenRowSet = useMemo(() => new Set(hiddenRows), [hiddenRows])

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
        // Nome repetido colapsa dados: `deriveDataset` monta cada linha como
        // `record[nome] = valor`, então duas colunas com o mesmo nome fazem a
        // segunda apagar a primeira sem aviso nenhum. O parser já desambigua
        // header colado/CSV com `uniqueHeader`; aqui aplicamos o mesmo
        // critério (sufixo " (2)", " (3)"…) para a edição manual.
        const others = new Set(
          draft.data.header.filter((_, i) => i !== columnIndex),
        )
        let base = value.trim() === '' ? `Coluna ${columnIndex + 1}` : value
        let candidate = base
        let suffix = 2
        while (others.has(candidate)) {
          candidate = `${base} (${suffix})`
          suffix += 1
        }
        const next = candidate
        draft.data.header[columnIndex] = next
        // O spec aponta colunas pelo nome, então renomear precisa arrastar as
        // referências junto — senão o gráfico "perde" a série silenciosamente.
        const swap = (name: string | null) => (name === previous ? next : name)
        draft.encoding.x = swap(draft.encoding.x)
        draft.encoding.series = swap(draft.encoding.series)
        draft.encoding.size = swap(draft.encoding.size)
        draft.encoding.target = swap(draft.encoding.target)
        draft.encoding.label = swap(draft.encoding.label)
        draft.encoding.y = draft.encoding.y.map((n) => (n === previous ? next : n))
        draft.highlight.series = draft.highlight.series.map((n) =>
          n === previous ? next : n,
        )
        draft.highlight.categories = draft.highlight.categories.map((n) =>
          n === previous ? next : n,
        )
        if (draft.transform.sortBy === previous) draft.transform.sortBy = next
        if (previous in draft.data.overrides) {
          draft.data.overrides[next] = draft.data.overrides[previous]
          delete draft.data.overrides[previous]
        }
        if (previous in draft.color.overrides) {
          draft.color.overrides[next] = draft.color.overrides[previous]
          delete draft.color.overrides[previous]
        }
        draft.transform.hiddenColumns = draft.transform.hiddenColumns.map((n) =>
          n === previous ? next : n,
        )
        // Anotação de ponto guarda o nome da série separado do resto do spec.
        for (const a of draft.annotations) {
          if (a.kind === 'point' && a.series === previous) a.series = next
        }
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
      // Índices depois da linha removida deslizam uma posição — sem isso
      // `hiddenRows` passaria a apontar para a linha errada.
      draft.transform.hiddenRows = draft.transform.hiddenRows
        .filter((i) => i !== rowIndex)
        .map((i) => (i > rowIndex ? i - 1 : i))
    })

  // Ocultar espelha o mesmo tratamento que a coluna já tem: some do gráfico,
  // continua na grade e nos dados — reversível, ao contrário do antigo duplo
  // clique que apagava a linha de verdade.
  const toggleHiddenRow = (rowIndex: number) =>
    update((draft) => {
      const list = draft.transform.hiddenRows
      const index = list.indexOf(rowIndex)
      if (index >= 0) list.splice(index, 1)
      else list.push(rowIndex)
    })

  const showAllRows = () =>
    update((draft) => {
      draft.transform.hiddenRows = []
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
          <caption className="sr-only">
            Tabela de dados, {source.rows.length} linhas e {source.header.length} colunas. Edite as
            células diretamente.
          </caption>
          <thead>
            <tr>
              <th className="row-index" scope="col" />
              {source.header.map((name, columnIndex) => {
                const isHidden = hidden.has(name)
                return (
                  <th key={columnIndex} scope="col" className={isHidden ? 'th-hidden' : undefined}>
                    <div className="col-head">
                      <input
                        type="text"
                        aria-label={`Nome da coluna ${columnIndex + 1}`}
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
                          aria-label={
                            isHidden
                              ? `Mostrar coluna "${name}" de volta no gráfico`
                              : `Ocultar coluna "${name}" (some do gráfico, mas fica nos dados)`
                          }
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
                          aria-label={`Excluir coluna "${name}" (apaga os dados)`}
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
                      aria-label={`Tipo da coluna ${name}`}
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
            {visible.map(({ rowIndex, row }) => {
              const isRowHidden = hiddenRowSet.has(rowIndex)
              return (
                <tr key={rowIndex} className={isRowHidden ? 'row-hidden' : undefined}>
                  <td className="row-index">
                    <div className="row-head">
                      <span className="row-number">{rowIndex + 1}</span>
                      <span className="row-actions">
                        <button
                          type="button"
                          className="row-btn"
                          aria-label={
                            isRowHidden
                              ? `Mostrar linha ${rowIndex + 1} de volta no gráfico`
                              : `Ocultar linha ${rowIndex + 1} (some do gráfico, mas fica nos dados)`
                          }
                          title={
                            isRowHidden
                              ? 'Mostrar linha de volta no gráfico'
                              : 'Ocultar linha (some do gráfico, mas fica nos dados)'
                          }
                          onClick={() => toggleHiddenRow(rowIndex)}
                        >
                          {isRowHidden ? '🚫' : '👁'}
                        </button>
                        <button
                          type="button"
                          className="row-btn danger"
                          aria-label={`Excluir linha ${rowIndex + 1} (apaga os dados)`}
                          title="Excluir linha (apaga os dados)"
                          onClick={() => {
                            if (window.confirm(`Excluir a linha ${rowIndex + 1}? Isso apaga os dados dela.`)) {
                              removeRow(rowIndex)
                            }
                          }}
                        >
                          ×
                        </button>
                      </span>
                    </div>
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
                        aria-label={`${name}, linha ${rowIndex + 1}`}
                        value={row[columnIndex] ?? ''}
                        onChange={(e) => setCell(rowIndex, columnIndex, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {hiddenRows.length > 0 && (
        <div className="inline-note">
          {hiddenRows.length} linha{hiddenRows.length > 1 ? 's' : ''} oculta
          {hiddenRows.length > 1 ? 's' : ''} ·{' '}
          <button type="button" className="btn tiny ghost" onClick={showAllRows}>
            mostrar todas
          </button>
        </div>
      )}

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
