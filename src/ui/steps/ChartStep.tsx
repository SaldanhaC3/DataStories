/**
 * Etapa 2 — Gráfico.
 *
 * Escolha do tipo, mapeamento das colunas e ajuste dos eixos. O conselheiro
 * aparece no topo com as três formas mais adequadas à tabela carregada: é o
 * atalho para quem não quer decidir sozinho, e uma explicação para quem quer.
 */

import { useMemo } from 'react'
import type { ChartSpec, ChartType, Dataset } from '../../core/types'
import { allChartDefinitions, getChartDefinition } from '../../core/render'
import { recommend } from '../../advisor/recommend'
import { THEMES } from '../../core/theme/themes'
import { inferXColumn, inferYColumns } from '../../core/model'
import { useEditor } from '../../state/store'
import { ChartIcon } from '../ChartIcon'
import { Chip, Field, Group, NumberInput, Segmented, Select, TextInput, Toggle } from '../controls'

/**
 * Receitas prontas de formato de número: cobrem o pedido comum ("sem casas",
 * "percentual") sem obrigar quem não conhece d3-format a decifrar um
 * especificador cru. Vazio = automático, resolvido em frame.ts.
 */
const NUMBER_FORMAT_PRESETS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Automático' },
  { value: ',.0f', label: 'Inteiro' },
  { value: ',.1f', label: 'Uma casa' },
  { value: ',.2f', label: 'Duas casas' },
  { value: '.0%', label: 'Percentual' },
]

export function ChartStep({ spec, dataset }: { spec: ChartSpec; dataset: Dataset }) {
  const update = useEditor((s) => s.update)
  const definition = getChartDefinition(spec.chart.type)
  const recommendations = useMemo(() => recommend(dataset).slice(0, 3), [dataset])

  const numericColumns = dataset.columns.filter((c) => c.type === 'number')
  const activeY = spec.encoding.y.length > 0
    ? spec.encoding.y
    : inferYColumns(dataset, [spec.encoding.x ?? inferXColumn(dataset), spec.encoding.series])

  const setType = (type: ChartType) =>
    update((draft) => {
      draft.chart.type = type
      const next = getChartDefinition(type)
      if (!next.supportsStacking) draft.chart.options.stack = 'none'
      // Gráficos de uma série só ficariam desenhando lixo com cinco colunas
      // marcadas; cortamos ao entrar em vez de falhar em silêncio.
      if (Number.isFinite(next.seriesLimit) && draft.encoding.y.length > next.seriesLimit) {
        draft.encoding.y = draft.encoding.y.slice(0, next.seriesLimit)
      }
    })

  const toggleY = (name: string) =>
    update((draft) => {
      const list = draft.encoding.y.length > 0 ? draft.encoding.y : [...activeY]
      const index = list.indexOf(name)
      if (index >= 0) list.splice(index, 1)
      else list.push(name)
      draft.encoding.y = list
    })

  const grouped = useMemo(() => {
    const map = new Map<string, ReturnType<typeof allChartDefinitions>>()
    for (const item of allChartDefinitions()) {
      const list = map.get(item.group) ?? []
      list.push(item)
      map.set(item.group, list)
    }
    return [...map.entries()]
  }, [])

  return (
    <>
      {recommendations.length > 0 && (
        <Group title="Sugerido para estes dados">
          {recommendations.map((item) => (
            <button
              key={item.type}
              type="button"
              className="recommendation"
              style={{ cursor: 'pointer', textAlign: 'left' }}
              onClick={() => setType(item.type)}
            >
              <strong>{item.label}</strong>
              <p>{item.reason}</p>
            </button>
          ))}
        </Group>
      )}

      {grouped.map(([group, items]) => (
        <Group key={group} title={group}>
          <div className="chart-grid">
            {items.map((item) => (
              <button
                key={item.type}
                type="button"
                className="chart-option"
                aria-pressed={item.type === spec.chart.type}
                title={item.hint}
                onClick={() => setType(item.type)}
              >
                <ChartIcon type={item.type} />
                {item.label}
              </button>
            ))}
          </div>
        </Group>
      ))}

      <p className="inline-note">{definition.hint}</p>

      <div className="divider" />

      <Group title="Colunas">
        <Field
          label={definition.orientation === 'horizontal' ? 'Categorias' : 'Eixo horizontal'}
        >
          <Select
            value={spec.encoding.x}
            allowEmpty
            emptyLabel={`automático (${inferXColumn(dataset) ?? '—'})`}
            options={dataset.columns.map((c) => ({ value: c.name, label: c.name }))}
            onChange={(value) =>
              update((draft) => {
                draft.encoding.x = value
              })
            }
          />
        </Field>

        <Field
          label="Valores"
          hint={
            Number.isFinite(definition.seriesLimit)
              ? `Este gráfico usa ${definition.seriesLimit} coluna(s).`
              : 'Clique para incluir ou remover colunas.'
          }
        >
          <div className="chip-row">
            {numericColumns.map((column) => (
              <Chip
                key={column.name}
                label={column.name}
                active={activeY.includes(column.name)}
                onClick={() => toggleY(column.name)}
              />
            ))}
            {numericColumns.length === 0 && (
              <div className="empty-values">
                <p className="inline-note">
                  Nenhuma coluna numérica reconhecida. Clique numa coluna abaixo para tratá-la
                  como número — ou ajuste o formato dos números na etapa Dados.
                </p>
                <div className="chip-row">
                  {dataset.columns.map((column) => (
                    <Chip
                      key={column.name}
                      label={`${column.name} → número`}
                      active={false}
                      onClick={() =>
                        update((draft) => {
                          draft.data.overrides[column.name] = 'number'
                          if (!draft.encoding.y.includes(column.name)) {
                            draft.encoding.y.push(column.name)
                          }
                        })
                      }
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Field>

        <Field
          label="Coluna de série (formato longo)"
          hint="Use quando cada linha da tabela é uma observação e há uma coluna com o nome da série."
        >
          <Select
            value={spec.encoding.series}
            allowEmpty
            emptyLabel="não usar"
            options={dataset.columns
              .filter((c) => c.type === 'category')
              .map((c) => ({ value: c.name, label: c.name }))}
            onChange={(value) =>
              update((draft) => {
                draft.encoding.series = value
              })
            }
          />
        </Field>

        {spec.chart.type === 'bullet' && (
          <Field label="Coluna da meta">
            <Select
              value={spec.encoding.target}
              allowEmpty
              emptyLabel="segunda coluna numérica"
              options={numericColumns.map((c) => ({ value: c.name, label: c.name }))}
              onChange={(value) =>
                update((draft) => {
                  draft.encoding.target = value
                })
              }
            />
          </Field>
        )}
      </Group>

      <Group title="Rótulos e números">
        <Toggle
          checked={spec.labels.valueLabels}
          label="Mostrar os valores no gráfico"
          onChange={(value) =>
            update((draft) => {
              draft.labels.valueLabels = value
            })
          }
        />
        <Toggle
          checked={spec.labels.labelHighlightedOnly}
          label="Só nas séries/categorias destacadas"
          onChange={(value) =>
            update((draft) => {
              draft.labels.labelHighlightedOnly = value
            })
          }
        />
        <p className="inline-note">
          Em linhas e dispersões os números aparecem apenas quando há espaço de leitura — com
          pontos demais, o tooltip no hover cobre o papel deles.
        </p>
      </Group>

      <Group title="Aparência do gráfico">
        {definition.supportsStacking && (
          <Field label="Empilhamento">
            <Segmented
              value={spec.chart.options.stack}
              options={[
                { value: 'none', label: 'Lado a lado' },
                { value: 'stacked', label: 'Empilhado' },
                { value: 'stacked100', label: '100%' },
              ]}
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.stack = value
                })
              }
            />
          </Field>
        )}

        {(spec.chart.type === 'line' || spec.chart.type === 'area') && (
          <>
            <Field label="Traçado">
              <Segmented
                value={spec.chart.options.curve}
                options={[
                  { value: 'linear', label: 'Reto' },
                  { value: 'smooth', label: 'Suave' },
                  { value: 'step', label: 'Degrau' },
                ]}
                onChange={(value) =>
                  update((draft) => {
                    draft.chart.options.curve = value
                  })
                }
              />
            </Field>
            <Toggle
              checked={spec.chart.options.showPoints}
              label="Marcar os pontos"
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.showPoints = value
                })
              }
            />
            <Field label="Espessura da linha">
              <NumberInput
                value={spec.chart.options.strokeWidth}
                min={0.5}
                max={8}
                step={0.2}
                onChange={(value) =>
                  update((draft) => {
                    draft.chart.options.strokeWidth = value ?? 2.4
                  })
                }
              />
            </Field>
            <Field label="Tamanho dos pontos">
              <NumberInput
                value={spec.chart.options.pointRadius}
                min={1}
                max={10}
                step={0.5}
                onChange={(value) =>
                  update((draft) => {
                    draft.chart.options.pointRadius = value ?? 3.5
                  })
                }
              />
            </Field>
            {spec.chart.type === 'area' && (
              <Field label="Opacidade do preenchimento" hint="0,1 = bem leve; 0,6 = denso.">
                <NumberInput
                  value={spec.chart.options.fillOpacity}
                  min={0.05}
                  max={1}
                  step={0.05}
                  onChange={(value) =>
                    update((draft) => {
                      draft.chart.options.fillOpacity = value ?? 0.18
                    })
                  }
                />
              </Field>
            )}
          </>
        )}

        {(spec.chart.type === 'scatter' || spec.chart.type === 'dumbbell' || spec.chart.type === 'lollipop') && (
          <Field label="Tamanho dos pontos">
            <NumberInput
              value={spec.chart.options.pointRadius}
              min={1}
              max={10}
              step={0.5}
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.pointRadius = value ?? 3.5
                })
              }
            />
          </Field>
        )}

        {(spec.chart.type === 'bar' || spec.chart.type === 'bar-horizontal') && (
          <Field label="Espaço entre barras" hint="0 = barras coladas, 0,5 = bem separadas.">
            <NumberInput
              value={spec.chart.options.barPadding}
              min={0}
              max={0.9}
              step={0.02}
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.barPadding = value ?? 0.22
                })
              }
            />
          </Field>
        )}

        {spec.chart.type === 'donut' && (
          <Field label="Furo central" hint="0 vira pizza; 0,6 é a proporção clássica de rosca.">
            <NumberInput
              value={spec.chart.options.innerRadius}
              min={0}
              max={0.9}
              step={0.02}
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.innerRadius = value ?? 0.58
                })
              }
            />
          </Field>
        )}

        {spec.chart.type === 'histogram' && (
          <Field
            label="Número de faixas"
            hint="Vazio usa a regra de Freedman–Diaconis, robusta a valores extremos."
          >
            <NumberInput
              value={spec.chart.options.bins}
              min={2}
              max={60}
              placeholder="automático"
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.bins = value
                })
              }
            />
          </Field>
        )}

        {spec.chart.type === 'waffle' && (
          <Field label="Total de células" hint="100 células = cada quadrado vale 1%.">
            <NumberInput
              value={spec.chart.options.waffleCells}
              min={9}
              max={400}
              onChange={(value) =>
                update((draft) => {
                  draft.chart.options.waffleCells = value ?? 100
                })
              }
            />
          </Field>
        )}
      </Group>

      <Group title="Eixos">
        {!definition.bare && (
          <Field
            label="Orientação"
            hint="Em barras, troca vertical ↔ horizontal. Nos demais, troca a coluna do eixo X com a primeira de valores."
          >
            <button
              type="button"
              className="btn tiny"
              onClick={() =>
                update((draft) => {
                  // Barras têm um tipo para cada orientação; trocar o tipo
                  // preserva todo o resto do spec (cores, eixos, anotações).
                  if (draft.chart.type === 'bar') {
                    draft.chart.type = 'bar-horizontal'
                    return
                  }
                  if (draft.chart.type === 'bar-horizontal') {
                    draft.chart.type = 'bar'
                    return
                  }
                  // Nos demais, o "trocar eixos" é trocar as colunas de lugar.
                  const x = draft.encoding.x
                  if (!x || draft.encoding.y.length === 0) return
                  const firstY = draft.encoding.y[0]
                  draft.encoding.y = [x, ...draft.encoding.y.slice(1)]
                  draft.encoding.x = firstY
                })
              }
            >
              ⇄ Trocar eixos (X ↔ Y)
            </button>
          </Field>
        )}
        <div className="row">
          <Field label="Mínimo">
            <NumberInput
              value={spec.axes.y.min}
              placeholder="auto"
              onChange={(value) =>
                update((draft) => {
                  draft.axes.y.min = value
                })
              }
            />
          </Field>
          <Field label="Máximo">
            <NumberInput
              value={spec.axes.y.max}
              placeholder="auto"
              onChange={(value) =>
                update((draft) => {
                  draft.axes.y.max = value
                })
              }
            />
          </Field>
          <Field label="Unidade">
            <TextInput
              value={spec.axes.y.unit}
              placeholder="%"
              onChange={(value) =>
                update(
                  (draft) => {
                    draft.axes.y.unit = value
                  },
                  { coalesceKey: 'unit' },
                )
              }
            />
          </Field>
        </div>

        <Field
          label="Formato dos números"
          hint="Receitas prontas cobrem o comum. Quem conhece a sintaxe d3-format pode digitar um especificador próprio no campo avançado abaixo — ele vence a receita escolhida acima."
        >
          <Segmented
            value={
              NUMBER_FORMAT_PRESETS.some((preset) => preset.value === (spec.axes.y.format ?? ''))
                ? spec.axes.y.format ?? ''
                : ''
            }
            options={NUMBER_FORMAT_PRESETS.map(({ value, label }) => ({ value, label }))}
            onChange={(value) =>
              update((draft) => {
                draft.axes.y.format = value === '' ? null : value
              })
            }
          />
        </Field>

        <Field
          label="Formato avançado (opcional)"
          hint="Especificador d3-format cru, ex.: ,.2s vira 1,2 mil. Deixe vazio para usar a receita acima."
        >
          <TextInput
            value={spec.axes.y.format ?? ''}
            placeholder="automático"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.axes.y.format = value === '' ? null : value
                },
                { coalesceKey: 'yformat' },
              )
            }
          />
        </Field>

        <div className="row">
          <Field label="Ticks do eixo" hint="Vazio escolhe sozinho pelo tamanho.">
            <NumberInput
              value={spec.axes.y.ticks}
              min={2}
              max={12}
              placeholder="automático"
              onChange={(value) =>
                update((draft) => {
                  draft.axes.y.ticks = value
                })
              }
            />
          </Field>
          <Field label="Título do eixo X">
            <TextInput
              value={spec.axes.x.title}
              placeholder="opcional"
              onChange={(value) =>
                update(
                  (draft) => {
                    draft.axes.x.title = value
                  },
                  { coalesceKey: 'xtitle' },
                )
              }
            />
          </Field>
        </div>

        <Field label="Título do eixo de valores">
          <TextInput
            value={spec.axes.y.title}
            placeholder="opcional"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.axes.y.title = value
                },
                { coalesceKey: 'ytitle' },
              )
            }
          />
        </Field>

        <Toggle
          checked={spec.axes.y.zero}
          label="Forçar início no zero"
          onChange={(value) =>
            update((draft) => {
              draft.axes.y.zero = value
            })
          }
        />
        <Toggle
          checked={spec.axes.y.grid}
          label="Mostrar grade"
          onChange={(value) =>
            update((draft) => {
              draft.axes.y.grid = value
            })
          }
        />
        <Toggle
          checked={spec.axes.y.visible}
          label="Mostrar régua de valores"
          onChange={(value) =>
            update((draft) => {
              draft.axes.y.visible = value
            })
          }
        />
        <Toggle
          checked={spec.axes.x.visible}
          label="Mostrar rótulos de categoria"
          onChange={(value) =>
            update((draft) => {
              draft.axes.x.visible = value
            })
          }
        />
        <Toggle
          checked={spec.axes.y.log}
          label="Escala logarítmica"
          onChange={(value) =>
            update((draft) => {
              draft.axes.y.log = value
            })
          }
        />
      </Group>

      <Group title="Tema">
        <div className="theme-grid">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className="theme-option"
              aria-pressed={theme.id === spec.theme.id}
              title={theme.description}
              onClick={() =>
                update((draft) => {
                  draft.theme.id = theme.id
                })
              }
            >
              <b>{theme.name}</b>
              <span className="swatches">
                <i style={{ background: theme.background, boxShadow: 'inset 0 0 0 1px #ccc' }} />
                {theme.palette.slice(0, 4).map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
            </button>
          ))}
        </div>

        <Field label="Tipo de paleta" hint="Sequencial e divergente servem quando a ordem das séries tem significado.">
          <Segmented
            value={spec.color.kind}
            options={[
              { value: 'categorical', label: 'Categórica' },
              { value: 'sequential', label: 'Sequencial' },
              { value: 'diverging', label: 'Divergente' },
              { value: 'single', label: 'Uma cor' },
            ]}
            onChange={(value) =>
              update((draft) => {
                draft.color.kind = value
              })
            }
          />
        </Field>

        <Toggle
          checked={spec.theme.overrides.background === 'transparent'}
          label="Fundo transparente (para embutir em qualquer superfície)"
          onChange={(value) =>
            update((draft) => {
              if (value) draft.theme.overrides.background = 'transparent'
              else delete draft.theme.overrides.background
            })
          }
        />

        <Toggle
          checked={spec.color.reverse}
          label="Inverter a ordem das cores"
          onChange={(value) =>
            update((draft) => {
              draft.color.reverse = value
            })
          }
        />
      </Group>
    </>
  )
}
