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
import { createDefaultSpec } from '../../core/schema'
import { recommend } from '../../advisor/recommend'
import { EXAMPLES } from '../../examples/samples'
import { useEditor } from '../../state/store'
import { DataGrid } from '../DataGrid'
import { Field, Group, NumberInput, Segmented, Select, Toggle } from '../controls'

// Extensões que o FileReader lê como texto de verdade. Qualquer coisa fora
// daqui vira bytes binários interpretados como texto — uma tabela de lixo
// silenciosa, que é exatamente o defeito que esta lista evita.
const ACCEPTED_EXTENSIONS = ['.csv', '.tsv', '.txt']
// Formatos de planilha binária: o problema não é "arquivo errado", é "esta
// ferramenta não sabe ler isto ainda". Por isso a mensagem sugere um caminho,
// não só recusa.
const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.ods']
const MAX_RECOMMENDED_BYTES = 10 * 1024 * 1024

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

export function DataStep({ spec, dataset }: { spec: ChartSpec; dataset: Dataset }) {
  const update = useEditor((s) => s.update)
  const replaceSpec = useEditor((s) => s.replaceSpec)
  const showToast = useEditor((s) => s.showToast)
  const [pasted, setPasted] = useState('')
  const [over, setOver] = useState(false)
  const [reading, setReading] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  /**
   * Substitui a tabela inteira a partir de `createDefaultSpec()`, preservando
   * só o que pertence ao autor (`text`, `theme`, `layout`, `chart.type`) — tudo
   * que é derivado do dado antigo (eixos fixados, anotações, cores por
   * categoria, limite de linhas, faixas de histograma...) volta ao padrão.
   * É a divisão que evita a classe inteira de bug "troquei de tabela e o
   * gráfico ficou esquisito sem eu entender por quê": um eixo fixado em 0–100
   * da tabela anterior não sobrevive para achatar o gráfico novo, e anotações
   * não ficam apontando para categorias que não existem mais.
   */
  const ingest = useCallback(
    (text: string) => {
      if (!text.trim()) return
      const source = parseDelimited(text)
      if (source.header.length === 0 || source.rows.length === 0) {
        showToast(
          'Não encontrei linhas e colunas nesse texto — confira se há um cabeçalho e ao menos uma linha de dados.',
        )
        return
      }
      const dataset = deriveDataset(source)
      const x = inferXColumn(dataset)
      const y = inferYColumns(dataset, [x, null]).slice(0, 4)

      const fresh = createDefaultSpec({ text: spec.text, theme: spec.theme, layout: spec.layout })
      fresh.id = spec.id
      fresh.data = source
      fresh.encoding = { x, y, series: null, size: null, label: null, target: null }

      // O conselheiro decide já na entrada dos dados, não só quando o autor
      // chega à etapa Gráfico — quem cola 12 meses de série temporal não deve
      // precisar navegar para descobrir que existe um gráfico de linha melhor
      // que a barra padrão. Só troca com confiança alta; com score baixo o
      // palpite fica pior que manter o que já estava escolhido.
      const [best] = recommend(dataset)
      const applyRecommendation = Boolean(best && best.score >= 0.85)
      fresh.chart.type = applyRecommendation && best ? best.type : spec.chart.type

      update((draft) => {
        Object.assign(draft, fresh)
      })

      showToast(
        `${source.rows.length} linhas · ${source.header.length} colunas · separador "${detectDelimiter(text)}" · ${detectLocale(text)}` +
          (y.length > 0 ? ` · ${y.length} coluna(s) de valores no gráfico` : ' · nenhuma coluna numérica detectada') +
          (applyRecommendation && best ? ` · gráfico de ${best.label} aplicado (${best.reason})` : ''),
      )
    },
    [update, showToast, spec.text, spec.theme, spec.layout, spec.id, spec.chart.type],
  )

  const onFile = useCallback(
    (file: File) => {
      const ext = extensionOf(file.name)

      if (SPREADSHEET_EXTENSIONS.includes(ext)) {
        showToast({
          kind: 'erro',
          message: `Arquivos ${ext} são planilhas binárias e não são lidos aqui — abra no Excel/Sheets e exporte como CSV antes de carregar.`,
        })
        return
      }
      if (!ACCEPTED_EXTENSIONS.includes(ext)) {
        showToast({
          kind: 'erro',
          message: `Arquivo "${file.name}" não reconhecido. Formatos aceitos: .csv, .tsv ou .txt.`,
        })
        return
      }
      if (file.size > MAX_RECOMMENDED_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1)
        const proceed = confirm(
          `O arquivo tem ${mb} MB, acima dos ~10 MB recomendados. A leitura pode demorar ou travar a aba. Continuar mesmo assim?`,
        )
        if (!proceed) return
      }

      setReading(true)
      const reader = new FileReader()
      reader.onload = () => {
        setReading(false)
        ingest(String(reader.result ?? ''))
      }
      reader.onerror = () => {
        setReading(false)
        showToast({
          kind: 'erro',
          message: 'Não foi possível ler o arquivo. Confira se ele não está corrompido e tente de novo.',
        })
      }
      reader.readAsText(file, 'utf-8')
    },
    [ingest, showToast],
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
          <button
            type="button"
            className="btn"
            disabled={reading}
            onClick={() => fileInput.current?.click()}
          >
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
          aria-busy={reading}
          aria-disabled={reading}
          onDragOver={(e) => {
            e.preventDefault()
            if (!reading) setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            if (reading) return
            const file = e.dataTransfer.files?.[0]
            if (file) onFile(file)
          }}
          onClick={() => {
            if (!reading) fileInput.current?.click()
          }}
        >
          {reading ? 'Lendo arquivo…' : 'Arraste um arquivo CSV ou TSV para cá'}
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
