/**
 * Etapa 3 — Anotar.
 *
 * É a etapa que a maioria das ferramentas open source não tem, e a razão de
 * ser desta. Um gráfico correto vira um gráfico que explica quando ganha
 * quatro coisas: um título que conclui, uma série em destaque, uma anotação
 * onde algo aconteceu e uma fonte no rodapé. Os controles estão nessa ordem
 * de propósito.
 */

import type { ChartSpec, Dataset, Theme } from '../../core/types'
import { buildModel } from '../../core/model'
import { getChartDefinition } from '../../core/render'
import { newId } from '../../core/schema'
import { useEditor } from '../../state/store'
import {
  Chip,
  ColorInput,
  Field,
  Group,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '../controls'

const TITLE_ADVICE =
  'Diga a conclusão, não o assunto: "Vendas caem 23% desde julho" em vez de "Vendas por mês".'

export function AnnotateStep({
  spec,
  dataset,
  theme,
}: {
  spec: ChartSpec
  dataset: Dataset
  theme: Theme
}) {
  const update = useEditor((s) => s.update)
  const addAnnotation = useEditor((s) => s.addAnnotation)
  const removeAnnotation = useEditor((s) => s.removeAnnotation)
  const selected = useEditor((s) => s.selectedAnnotation)
  const selectAnnotation = useEditor((s) => s.selectAnnotation)

  const definition = getChartDefinition(spec.chart.type)
  const model = buildModel({ spec, dataset, theme })
  /**
   * Com uma serie so, destacar significa acender uma barra — uma categoria.
   * Com varias, significa acender uma serie inteira.
   */
  const byCategory =
    definition.bare || spec.chart.type === 'slope' || model.series.length <= 1

  const toggleHighlight = (key: string) =>
    update((draft) => {
      const list = byCategory ? draft.highlight.categories : draft.highlight.series
      const index = list.indexOf(key)
      if (index >= 0) list.splice(index, 1)
      else list.push(key)
    })

  const highlightList = byCategory ? spec.highlight.categories : spec.highlight.series
  const highlightOptions = byCategory
    ? model.categoryLabels.map((label, i) => ({ label, color: undefined, key: label, i }))
    : model.series.map((s, i) => ({ label: s.name, color: s.color, key: s.name, i }))

  return (
    <>
      <Group title="Texto">
        <Field
          label={`Título  ·  ${spec.text.title.length} caracteres`}
          hint={TITLE_ADVICE}
        >
          <TextArea
            value={spec.text.title}
            rows={2}
            placeholder="Assinaturas dobram no ano enquanto o avulso encolhe 40%"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.text.title = value
                },
                { coalesceKey: 'title' },
              )
            }
          />
        </Field>

        <Field
          label="Subtítulo"
          hint="Aqui vai o que o título não cabe: unidade, recorte, período."
        >
          <TextArea
            value={spec.text.subtitle}
            rows={2}
            placeholder="Receita mensal por canal, em milhares de reais"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.text.subtitle = value
                },
                { coalesceKey: 'subtitle' },
              )
            }
          />
        </Field>
      </Group>

      <Group title={byCategory ? 'Destacar categorias' : 'Destacar séries'}>
        <p className="inline-note">
          O que estiver destacado fica colorido; o resto vai para cinza. Também dá para clicar
          direto numa marca do gráfico.
        </p>
        <div className="chip-row">
          {highlightOptions.map((option) => (
            <Chip
              key={option.key}
              label={option.label}
              color={option.color}
              active={highlightList.includes(option.key)}
              onClick={() => toggleHighlight(option.key)}
            />
          ))}
        </div>
        {highlightList.length > 0 && (
          <button
            type="button"
            className="btn tiny ghost"
            onClick={() =>
              update((draft) => {
                if (byCategory) draft.highlight.categories = []
                else draft.highlight.series = []
              })
            }
          >
            limpar destaque
          </button>
        )}
      </Group>

      <Group title="Rótulos">
        {definition.supportsDirectLabels && (
          <Toggle
            checked={spec.labels.directLabels}
            label="Rótulo direto na ponta da linha (em vez de legenda)"
            onChange={(value) =>
              update((draft) => {
                draft.labels.directLabels = value
              })
            }
          />
        )}
        <Toggle
          checked={spec.labels.valueLabels}
          label="Mostrar o valor sobre cada marca"
          onChange={(value) =>
            update((draft) => {
              draft.labels.valueLabels = value
            })
          }
        />
        {spec.labels.directLabels && definition.supportsDirectLabels && (
          <Toggle
            checked={spec.labels.labelHighlightedOnly}
            label="Rotular apenas as séries destacadas"
            onChange={(value) =>
              update((draft) => {
                draft.labels.labelHighlightedOnly = value
              })
            }
          />
        )}
        <Field label="Legenda">
          <Segmented
            value={spec.labels.legend}
            options={[
              { value: 'auto', label: 'Automática' },
              { value: 'top', label: 'Sempre' },
              { value: 'off', label: 'Nunca' },
            ]}
            onChange={(value) =>
              update((draft) => {
                draft.labels.legend = value
              })
            }
          />
        </Field>
      </Group>

      <Group title="Cores por série">
        {model.series.map((series) => (
          <Field key={series.name} label={series.name}>
            <ColorInput
              value={spec.color.overrides[series.name] ?? null}
              fallback={series.color}
              onChange={(value) =>
                update((draft) => {
                  if (value === null) delete draft.color.overrides[series.name]
                  else draft.color.overrides[series.name] = value
                })
              }
            />
          </Field>
        ))}
        {model.series.length === 0 && (
          <span className="inline-note">Nenhuma série ativa no momento.</span>
        )}
      </Group>

      <div className="divider" />

      <Group title="Anotações">
        <div className="row">
          <button
            type="button"
            className="btn tiny"
            onClick={() =>
              addAnnotation({
                id: newId(),
                kind: 'text',
                text: 'Explique aqui o que aconteceu',
                x: 0.5,
                y: 0.18,
                align: 'left',
                size: 13,
                bold: false,
                color: null,
                background: true,
                connector: { enabled: true, tx: 0.65, ty: 0.45, arrow: true },
              })
            }
          >
            + texto
          </button>
          <button
            type="button"
            className="btn tiny"
            onClick={() =>
              addAnnotation({
                id: newId(),
                kind: 'line',
                axis: 'y',
                value: '',
                label: 'meta',
                dash: true,
                color: null,
              })
            }
          >
            + linha
          </button>
          <button
            type="button"
            className="btn tiny"
            onClick={() =>
              addAnnotation({
                id: newId(),
                kind: 'range',
                axis: 'x',
                from: '',
                to: '',
                label: 'período',
                color: null,
              })
            }
          >
            + faixa
          </button>
          <button
            type="button"
            className="btn tiny"
            onClick={() =>
              addAnnotation({
                id: newId(),
                kind: 'point',
                series: model.series[0]?.name ?? '',
                rowIndex: Math.max(0, model.categories.length - 1),
                label: '',
                showValue: true,
                color: null,
              })
            }
          >
            + ponto
          </button>
        </div>

        {spec.annotations.length === 0 && (
          <div className="empty">
            Sem anotações. Uma seta apontando o momento decisivo costuma valer mais que um
            parágrafo de texto ao lado do gráfico.
          </div>
        )}

        {spec.annotations.map((annotation) => (
          <div
            key={annotation.id}
            className={selected === annotation.id ? 'annotation-card selected' : 'annotation-card'}
            onFocus={() => selectAnnotation(annotation.id)}
            onClick={() => selectAnnotation(annotation.id)}
          >
            <header>
              <b>
                {annotation.kind === 'text'
                  ? 'texto'
                  : annotation.kind === 'line'
                    ? 'linha de referência'
                    : annotation.kind === 'range'
                      ? 'faixa'
                      : 'ponto'}
              </b>
              <button
                type="button"
                className="btn tiny ghost danger"
                onClick={() => removeAnnotation(annotation.id)}
              >
                remover
              </button>
            </header>

            {annotation.kind === 'text' && (
              <>
                <TextArea
                  value={annotation.text}
                  rows={2}
                  onChange={(value) =>
                    update(
                      (draft) => {
                        const a = draft.annotations.find((x) => x.id === annotation.id)
                        if (a?.kind === 'text') a.text = value
                      },
                      { coalesceKey: `annotation-text:${annotation.id}` },
                    )
                  }
                />
                <p className="inline-note">
                  Arraste o texto direto no gráfico para posicioná-lo.
                </p>
                <div className="row">
                  <Segmented
                    value={annotation.align}
                    options={[
                      { value: 'left', label: '⟵' },
                      { value: 'center', label: '↔' },
                      { value: 'right', label: '⟶' },
                    ]}
                    onChange={(value) =>
                      update((draft) => {
                        const a = draft.annotations.find((x) => x.id === annotation.id)
                        if (a?.kind === 'text') a.align = value
                      })
                    }
                  />
                </div>
                <Toggle
                  checked={annotation.connector.enabled}
                  label="Seta apontando para o gráfico"
                  onChange={(value) =>
                    update((draft) => {
                      const a = draft.annotations.find((x) => x.id === annotation.id)
                      if (a?.kind === 'text') a.connector.enabled = value
                    })
                  }
                />
                <Toggle
                  checked={annotation.background}
                  label="Fundo atrás do texto"
                  onChange={(value) =>
                    update((draft) => {
                      const a = draft.annotations.find((x) => x.id === annotation.id)
                      if (a?.kind === 'text') a.background = value
                    })
                  }
                />
                <Toggle
                  checked={annotation.bold}
                  label="Negrito"
                  onChange={(value) =>
                    update((draft) => {
                      const a = draft.annotations.find((x) => x.id === annotation.id)
                      if (a?.kind === 'text') a.bold = value
                    })
                  }
                />
                <ColorInput
                  value={annotation.color}
                  fallback={theme.foreground}
                  onChange={(value) =>
                    update((draft) => {
                      const a = draft.annotations.find((x) => x.id === annotation.id)
                      if (a?.kind === 'text') a.color = value
                    })
                  }
                />
              </>
            )}

            {annotation.kind === 'line' && (
              <>
                <div className="row">
                  <Field label="Eixo">
                    <Segmented
                      value={annotation.axis}
                      options={[
                        { value: 'y', label: 'Valor' },
                        { value: 'x', label: 'Categoria' },
                      ]}
                      onChange={(value) =>
                        update((draft) => {
                          const a = draft.annotations.find((x) => x.id === annotation.id)
                          if (a?.kind === 'line') a.axis = value
                        })
                      }
                    />
                  </Field>
                  <Field label={annotation.axis === 'y' ? 'Valor' : 'Categoria'}>
                    <TextInput
                      value={annotation.value}
                      placeholder={annotation.axis === 'y' ? '500' : model.categoryLabels[0] ?? ''}
                      onChange={(value) =>
                        update(
                          (draft) => {
                            const a = draft.annotations.find((x) => x.id === annotation.id)
                            if (a?.kind === 'line') a.value = value
                          },
                          { coalesceKey: `annotation-value:${annotation.id}` },
                        )
                      }
                    />
                  </Field>
                </div>
                <Field label="Rótulo">
                  <TextInput
                    value={annotation.label}
                    onChange={(value) =>
                      update(
                        (draft) => {
                          const a = draft.annotations.find((x) => x.id === annotation.id)
                          if (a?.kind === 'line') a.label = value
                        },
                        { coalesceKey: `annotation-label:${annotation.id}` },
                      )
                    }
                  />
                </Field>
                <Toggle
                  checked={annotation.dash}
                  label="Tracejada"
                  onChange={(value) =>
                    update((draft) => {
                      const a = draft.annotations.find((x) => x.id === annotation.id)
                      if (a?.kind === 'line') a.dash = value
                    })
                  }
                />
              </>
            )}

            {annotation.kind === 'range' && (
              <>
                <Field label="Eixo">
                  <Segmented
                    value={annotation.axis}
                    options={[
                      { value: 'x', label: 'Categoria' },
                      { value: 'y', label: 'Valor' },
                    ]}
                    onChange={(value) =>
                      update((draft) => {
                        const a = draft.annotations.find((x) => x.id === annotation.id)
                        if (a?.kind === 'range') a.axis = value
                      })
                    }
                  />
                </Field>
                <div className="row">
                  <Field label="De">
                    <TextInput
                      value={annotation.from}
                      placeholder={model.categoryLabels[0] ?? ''}
                      onChange={(value) =>
                        update(
                          (draft) => {
                            const a = draft.annotations.find((x) => x.id === annotation.id)
                            if (a?.kind === 'range') a.from = value
                          },
                          { coalesceKey: `annotation-from:${annotation.id}` },
                        )
                      }
                    />
                  </Field>
                  <Field label="Até">
                    <TextInput
                      value={annotation.to}
                      placeholder={model.categoryLabels[model.categoryLabels.length - 1] ?? ''}
                      onChange={(value) =>
                        update(
                          (draft) => {
                            const a = draft.annotations.find((x) => x.id === annotation.id)
                            if (a?.kind === 'range') a.to = value
                          },
                          { coalesceKey: `annotation-to:${annotation.id}` },
                        )
                      }
                    />
                  </Field>
                </div>
                <Field label="Rótulo">
                  <TextInput
                    value={annotation.label}
                    onChange={(value) =>
                      update(
                        (draft) => {
                          const a = draft.annotations.find((x) => x.id === annotation.id)
                          if (a?.kind === 'range') a.label = value
                        },
                        { coalesceKey: `annotation-rlabel:${annotation.id}` },
                      )
                    }
                  />
                </Field>
              </>
            )}

            {annotation.kind === 'point' && (
              <>
                <div className="row">
                  <Field label="Série">
                    <Select
                      value={annotation.series}
                      options={model.series.map((s) => ({ value: s.name, label: s.name }))}
                      onChange={(value) =>
                        update((draft) => {
                          const a = draft.annotations.find((x) => x.id === annotation.id)
                          if (a?.kind === 'point') a.series = value ?? ''
                        })
                      }
                    />
                  </Field>
                  <Field label="Ponto">
                    <Select
                      value={String(annotation.rowIndex)}
                      options={model.categoryLabels.map((label, i) => ({
                        value: String(i),
                        label,
                      }))}
                      onChange={(value) =>
                        update((draft) => {
                          const a = draft.annotations.find((x) => x.id === annotation.id)
                          if (a?.kind === 'point') a.rowIndex = Number(value ?? 0)
                        })
                      }
                    />
                  </Field>
                </div>
                <Field label="Rótulo">
                  <TextInput
                    value={annotation.label}
                    onChange={(value) =>
                      update(
                        (draft) => {
                          const a = draft.annotations.find((x) => x.id === annotation.id)
                          if (a?.kind === 'point') a.label = value
                        },
                        { coalesceKey: `annotation-plabel:${annotation.id}` },
                      )
                    }
                  />
                </Field>
                <Toggle
                  checked={annotation.showValue}
                  label="Mostrar o valor junto"
                  onChange={(value) =>
                    update((draft) => {
                      const a = draft.annotations.find((x) => x.id === annotation.id)
                      if (a?.kind === 'point') a.showValue = value
                    })
                  }
                />
              </>
            )}
          </div>
        ))}
      </Group>

      <div className="divider" />

      <Group title="Rodapé">
        <Field
          label="Fonte"
          hint="Sem isso o leitor não tem como verificar nada. É parte do gráfico, não um detalhe."
        >
          <TextInput
            value={spec.text.source}
            placeholder="IBGE, PNAD Contínua 2024"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.text.source = value
                },
                { coalesceKey: 'source' },
              )
            }
          />
        </Field>
        <Field
          label="Link da fonte"
          hint="O domínio aparece no rodapé ao lado da fonte — rastreável até no print."
        >
          <TextInput
            value={spec.text.sourceUrl}
            placeholder="ibge.gov.br/pnad"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.text.sourceUrl = value
                },
                { coalesceKey: 'sourceurl' },
              )
            }
          />
        </Field>
        <Field label="Nota metodológica">
          <TextInput
            value={spec.text.note}
            placeholder="Valores deflacionados pelo IPCA"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.text.note = value
                },
                { coalesceKey: 'note' },
              )
            }
          />
        </Field>
        <Field label="Crédito">
          <TextInput
            value={spec.text.credit}
            placeholder="Seu nome ou veículo"
            onChange={(value) =>
              update(
                (draft) => {
                  draft.text.credit = value
                },
                { coalesceKey: 'credit' },
              )
            }
          />
        </Field>
      </Group>
    </>
  )
}
