/**
 * Etapa 1 — Dados.
 *
 * Três formas de entrada, porque as três acontecem na prática: colar da
 * planilha, arrastar um CSV, ou digitar na grade. Depois de carregada, a
 * tabela ganha os controles de transformação que evitam ida e volta ao Excel.
 */

import { useCallback, useRef, useState } from 'react'
import type { ChartSpec, Dataset } from '../../core/types'
import { detectDelimiter, detectLocale, parseDelimited } from '../../core/dataset/parse'
import { deriveDataset } from '../../core/dataset/transform'
import { inferXColumn, inferYColumns } from '../../core/model'
import { EXAMPLES } from '../../examples/samples'
import { useEditor } from '../../state/store'
import { DataGrid } from '../DataGrid'
import { Field, Group, NumberInput, Segmented, Select, Toggle } from '../controls'

export function DataStep({ spec, dataset }: { spec: ChartSpec; dataset: Dataset }) {
  const update = useEditor((s) => s.update)
  const replaceSpec = useEditor((s) => s.replaceSpec)
  const showToast = useEditor((s) => s.showToast)
  const [pasted, setPasted] = useState('')
  const [over, setOver] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  /**
   * Substitui a tabela e remonta o mapeamento de colunas: manter o `encoding`
   * antigo apontando para colunas que não existem mais é a origem clássica do
   * "gráfico ficou vazio e não sei por quê". Em vez de zera-lo, inferimos um
   * encoding inicial a partir dos tipos detectados — a tabela já entra com um
   * gráfico desenhado, como se espera de uma ferramenta de um clique só.
   */
  const ingest = useCallback(
    (text: string) => {
      if (!text.trim()) return
      const source = parseDelimited(text)
      const dataset = deriveDataset(source)
      const x = inferXColumn(dataset)
      const y = inferYColumns(dataset, [x, null]).slice(0, 4)
      update((draft) => {
        draft.data = source
        draft.encoding = { x, y, series: null, size: null, label: null, target: null }
        draft.highlight = { series: [], categories: [] }
        draft.transform.sortBy = null
        draft.transform.hiddenColumns = []
        draft.transform.hiddenRows = []
      })
      showToast(
        `${source.rows.length} linhas · ${source.header.length} colunas · separador "${detectDelimiter(text)}" · ${detectLocale(text)}` +
          (y.length > 0 ? ` · ${y.length} coluna(s) de valores no gráfico` : ' · nenhuma coluna numérica detectada'),
      )
    },
    [update, showToast],
  )

  const onFile = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = () => ingest(String(reader.result ?? ''))
      reader.readAsText(file, 'utf-8')
    },
    [ingest],
  )

  return (
    <>
      <Group title="Carregar">
        <Field hint="Cole direto do Excel, do Google Sheets ou de qualquer tabela. O separador e o formato numérico são detectados.">
          <textarea
            rows={5}
            value={pasted}
            placeholder={'Categoria;2023;2024\nNorte;120;185\nSul;90;76'}
            onChange={(e) => setPasted(e.target.value)}
            onPaste={(e) => {
              const text = e.clipboardData.getData('text')
              if (text.includes('\n')) {
                e.preventDefault()
                setPasted(text)
                ingest(text)
              }
            }}
          />
        </Field>
        <div className="row">
          <button
            type="button"
            className="btn primary"
            disabled={!pasted.trim()}
            onClick={() => ingest(pasted)}
          >
            Usar esta tabela
          </button>
          <button type="button" className="btn" onClick={() => fileInput.current?.click()}>
            Abrir CSV
          </button>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
        />

        <div
          className={over ? 'dropzone over' : 'dropzone'}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) onFile(file)
          }}
          onClick={() => fileInput.current?.click()}
        >
          Arraste um arquivo CSV ou TSV para cá
        </div>
      </Group>

      <Group title="Começar de um exemplo">
        <div className="chip-row">
          {EXAMPLES.map((example) => (
            <button
              key={example.id}
              type="button"
              className="chip"
              onClick={() => {
                replaceSpec(example.build(), { resetHistory: true })
                showToast(`Exemplo "${example.name}" carregado`)
              }}
              title={example.description}
            >
              <span className="label">{example.name}</span>
            </button>
          ))}
        </div>
        <p className="inline-note">
          Cada exemplo traz dados, tipo de gráfico, tema e anotações — bons pontos de partida para
          ver o que a ferramenta faz.
        </p>
      </Group>

      <div className="divider" />

      <Group title="Interpretação">
        <Field
          label="Formato dos números"
          hint={
            spec.data.locale === 'pt-BR'
              ? 'Ponto separa milhar e vírgula separa decimal: 1.234,56.'
              : 'Vírgula separa milhar e ponto separa decimal: 1,234.56.'
          }
        >
          <Segmented
            value={spec.data.locale}
            options={[
              { value: 'pt-BR', label: 'Brasileiro' },
              { value: 'en-US', label: 'Americano' },
            ]}
            onChange={(locale) =>
              update((draft) => {
                draft.data.locale = locale
              })
            }
          />
        </Field>

        <Toggle
          checked={spec.transform.transpose}
          label="Transpor (trocar linhas por colunas)"
          onChange={(value) =>
            update((draft) => {
              draft.transform.transpose = value
              const next = deriveDataset(draft.data, draft.transform)
              const x = inferXColumn(next)
              draft.encoding = {
                x,
                y: inferYColumns(next, [x, null]).slice(0, 4),
                series: null,
                size: null,
                label: null,
                target: null,
              }
            })
          }
        />
      </Group>

      <Group title="Ordenar e limitar">
        <div className="row">
          <Field label="Ordenar por">
            <Select
              value={spec.transform.sortBy}
              allowEmpty
              emptyLabel="ordem original"
              options={dataset.columns.map((c) => ({ value: c.name, label: c.name }))}
              onChange={(value) =>
                update((draft) => {
                  draft.transform.sortBy = value
                  if (value && draft.transform.sortDirection === 'none') {
                    draft.transform.sortDirection = 'desc'
                  }
                })
              }
            />
          </Field>
          <Field label="Direção">
            <Segmented
              value={spec.transform.sortDirection}
              options={[
                { value: 'none', label: '—' },
                { value: 'asc', label: '↑' },
                { value: 'desc', label: '↓' },
              ]}
              onChange={(value) =>
                update((draft) => {
                  draft.transform.sortDirection = value
                })
              }
            />
          </Field>
        </div>
        <Field
          label="Mostrar apenas as N primeiras linhas"
          hint="Útil para rankings: ordene por valor e mostre o top 10."
        >
          <NumberInput
            value={spec.transform.limit}
            min={1}
            placeholder="todas"
            onChange={(value) =>
              update((draft) => {
                draft.transform.limit = value
              })
            }
          />
        </Field>
      </Group>

      <Group title="Tabela">
        <DataGrid source={spec.data} />
      </Group>
    </>
  )
}
