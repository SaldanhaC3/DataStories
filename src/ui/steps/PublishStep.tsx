/**
 * Etapa 4 — Publicar.
 *
 * Quatro saídas, cada uma para um destino real: SVG para quem vai retocar no
 * Illustrator, PNG para slide e rede social, HTML autocontido para colar num
 * site, e o JSON do projeto para reabrir e continuar depois.
 */

import { useState } from 'react'
import type { ChartSpec, Scene } from '../../core/types'
import {
  buildIframeSnippet,
  downloadEmbed,
  downloadPng,
  downloadSpec,
  downloadSvg,
} from '../../core/export'
import { useEditor } from '../../state/store'
import { Field, Group, NumberInput } from '../controls'

export function PublishStep({ spec, scene }: { spec: ChartSpec; scene: Scene }) {
  const update = useEditor((s) => s.update)
  const showToast = useEditor((s) => s.showToast)
  const loadFromJson = useEditor((s) => s.loadFromJson)
  const reset = useEditor((s) => s.reset)
  const [snippet, setSnippet] = useState<string | null>(null)

  const exportPng = async (scale: number) => {
    try {
      await downloadPng(scene, spec, scale)
      showToast(`PNG @${scale}x gerado`)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Falha ao gerar o PNG.')
    }
  }

  return (
    <>
      <Group title="Tamanho">
        <div className="row">
          <Field label="Largura (px)">
            <NumberInput
              value={spec.layout.width}
              min={240}
              max={4000}
              onChange={(value) =>
                update(
                  (draft) => {
                    draft.layout.width = value ?? 760
                  },
                  { coalesceKey: 'width' },
                )
              }
            />
          </Field>
          <Field label="Altura (px)">
            <NumberInput
              value={spec.layout.height}
              min={200}
              max={4000}
              onChange={(value) =>
                update(
                  (draft) => {
                    draft.layout.height = value ?? 480
                  },
                  { coalesceKey: 'height' },
                )
              }
            />
          </Field>
        </div>
        <div className="chip-row">
          {[
            { label: 'Artigo (760×480)', w: 760, h: 480 },
            { label: 'Quadrado (600×600)', w: 600, h: 600 },
            { label: 'Story (600×900)', w: 600, h: 900 },
            { label: 'Slide (1000×560)', w: 1000, h: 560 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              className="chip"
              onClick={() =>
                update((draft) => {
                  draft.layout.width = preset.w
                  draft.layout.height = preset.h
                })
              }
            >
              <span className="label">{preset.label}</span>
            </button>
          ))}
        </div>
      </Group>

      <Group title="Imagem">
        <div className="row">
          <button type="button" className="btn primary" onClick={() => exportPng(2)}>
            PNG @2x
          </button>
          <button type="button" className="btn" onClick={() => exportPng(3)}>
            @3x
          </button>
          <button type="button" className="btn" onClick={() => exportPng(1)}>
            @1x
          </button>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            downloadSvg(scene, spec)
            showToast('SVG gerado')
          }}
        >
          SVG (vetorial, editável no Illustrator)
        </button>
        <p className="inline-note">
          Os temas usam apenas fontes do sistema, então o PNG sai com a mesma tipografia da tela e
          o SVG não depende de nenhuma fonte instalada em quem abrir.
        </p>
      </Group>

      <Group title="Web">
        <button
          type="button"
          className="btn"
          onClick={() => {
            downloadEmbed(scene, spec)
            showToast('HTML de embed gerado')
          }}
        >
          Baixar HTML autocontido
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            const code = buildIframeSnippet(scene, spec)
            setSnippet(code)
            navigator.clipboard?.writeText(code).then(
              () => showToast('Código do iframe copiado'),
              () => showToast('Copie o código abaixo manualmente'),
            )
          }}
        >
          Copiar código do iframe
        </button>
        {snippet && <div className="code">{snippet.slice(0, 600)}…</div>}
        <p className="inline-note">
          O arquivo é responsivo e não faz nenhuma requisição de rede: abre igual em qualquer
          lugar, inclusive offline.
        </p>
      </Group>

      <div className="divider" />

      <Group title="Projeto">
        <button
          type="button"
          className="btn"
          onClick={() => {
            downloadSpec(spec)
            showToast('Projeto salvo')
          }}
        >
          Salvar arquivo .datastories.json
        </button>

        <label className="btn" style={{ textAlign: 'center', cursor: 'pointer' }}>
          Abrir projeto salvo
          <input
            type="file"
            accept=".json,application/json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (!file) return
              const reader = new FileReader()
              reader.onload = () => {
                const result = loadFromJson(String(reader.result ?? ''))
                showToast(result.ok ? 'Projeto carregado' : result.error)
              }
              reader.readAsText(file, 'utf-8')
            }}
          />
        </label>

        <button
          type="button"
          className="btn ghost danger"
          onClick={() => {
            if (confirm('Começar um gráfico em branco? O rascunho atual será descartado.')) {
              reset()
            }
          }}
        >
          Começar do zero
        </button>

        <p className="inline-note">
          O rascunho é salvo automaticamente no navegador. O arquivo .json guarda dados, tipo,
          tema, anotações e textos — tudo o que é preciso para reabrir exatamente este gráfico.
        </p>
      </Group>
    </>
  )
}
