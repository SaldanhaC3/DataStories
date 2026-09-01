/**
 * Etapa 4 — Publicar.
 *
 * Quatro saídas, cada uma para um destino real: SVG para quem vai retocar no
 * Illustrator, PNG para slide e rede social, HTML autocontido para colar num
 * site, e o JSON do projeto para reabrir e continuar depois.
 */

import { useRef, useState } from 'react'
import type { ChartSpec, Scene } from '../../core/types'
import { toCSV } from '../../core/dataset/parse'
import {
  buildIframeSnippet,
  download,
  downloadEmbed,
  downloadPng,
  downloadSpec,
  downloadSvg,
  fileNameFor,
  sceneToPngBlob,
} from '../../core/export'
import { useEditor } from '../../state/store'
import { Field, Group, NumberInput } from '../controls'

// Só oferece o botão quando o navegador de fato suporta imagem na área de
// transferência — em vez de mostrar um botão que falha sempre em navegadores
// mais antigos.
const canCopyImage =
  typeof navigator !== 'undefined' &&
  Boolean(navigator.clipboard) &&
  typeof window !== 'undefined' &&
  'ClipboardItem' in window

export function PublishStep({ spec, scene }: { spec: ChartSpec; scene: Scene }) {
  const update = useEditor((s) => s.update)
  const showToast = useEditor((s) => s.showToast)
  const loadFromJson = useEditor((s) => s.loadFromJson)
  const reset = useEditor((s) => s.reset)
  const [snippet, setSnippet] = useState<string | null>(null)
  const projectInput = useRef<HTMLInputElement | null>(null)

  const exportPng = async (scale: number) => {
    try {
      await downloadPng(scene, spec, scale)
      // Mesma conta que `sceneToPngBlob` faz para o canvas — não é um palpite,
      // é o tamanho real do arquivo que acabou de sair.
      const width = Math.round(scene.width * scale)
      const height = Math.round(scene.height * scale)
      showToast(`PNG @${scale}x gerado · ${width}×${height}px`)
    } catch (error) {
      showToast({
        kind: 'erro',
        message: error instanceof Error ? error.message : 'Falha ao gerar o PNG.',
      })
    }
  }

  const copyImage = async () => {
    try {
      const blob = await sceneToPngBlob(scene, 2)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      showToast('Imagem copiada — cole direto num slide ou documento.')
    } catch (error) {
      showToast({
        kind: 'erro',
        message:
          error instanceof Error
            ? `Não foi possível copiar a imagem: ${error.message}`
            : 'Não foi possível copiar a imagem. O navegador pode ter recusado a permissão.',
      })
    }
  }

  const exportData = () => {
    download(new Blob([toCSV(spec.data)], { type: 'text/csv;charset=utf-8' }), fileNameFor(spec, 'csv'))
    showToast('CSV com os dados da tabela gerado')
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
        {canCopyImage && (
          <button type="button" className="btn" onClick={copyImage}>
            Copiar imagem
          </button>
        )}
        <p className="inline-note">
          Os temas usam apenas fontes do sistema, então o PNG sai com a mesma tipografia da tela e
          o SVG não depende de nenhuma fonte instalada em quem abrir.
        </p>
      </Group>

      <Group title="Dados">
        <button type="button" className="btn" onClick={exportData}>
          Baixar dados (CSV)
        </button>
        <p className="inline-note">
          Quem lê o gráfico publicado também quer chegar aos números — o CSV sai com a tabela
          exatamente como foi carregada na etapa Dados (ordenação e limite de linhas são só do
          gráfico, não afetam este arquivo).
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
              () => showToast({ kind: 'erro', message: 'Não foi possível copiar. Use o código abaixo.' }),
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

        {/* Mesmo arranjo do "Abrir CSV" na etapa Dados: um `<label>` embrulhando
            um input `display:none` sai da ordem de foco e não é alcançável só
            de teclado. Botão real disparando o clique no input + `sr-only`
            (que só tira da tela, sem tirar do foco) resolve isso. */}
        <button type="button" className="btn" onClick={() => projectInput.current?.click()}>
          Abrir projeto salvo
        </button>
        <input
          ref={projectInput}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const result = loadFromJson(String(reader.result ?? ''))
              if (result.ok) showToast('Projeto carregado')
              else showToast({ kind: 'erro', message: result.error ?? 'Arquivo de projeto inválido.' })
            }
            reader.onerror = () =>
              showToast({ kind: 'erro', message: 'Não foi possível ler o arquivo do projeto.' })
            reader.readAsText(file, 'utf-8')
          }}
        />

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
