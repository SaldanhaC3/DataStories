/**
 * Casca do editor: barra superior, painel de quatro etapas e a tela.
 *
 * A cena é recalculada a cada mudança do spec. Isso é barato porque os
 * renderizadores são funções puras sobre estruturas pequenas — e é o que
 * permite ver o efeito de cada ajuste no mesmo instante, que é o ponto todo de
 * uma ferramenta de acabamento.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { renderChart } from '../core/render'
import type { SceneNode } from '../core/types'
import { getTheme } from '../core/theme/themes'
import { lintSpec } from '../advisor/lint'
import { selectDataset, useEditor, type Step } from '../state/store'
import { Canvas } from './Canvas'
import { LintPanel } from './LintPanel'
import { DataStep } from './steps/DataStep'
import { ChartStep } from './steps/ChartStep'
import { AnnotateStep } from './steps/AnnotateStep'
import { PublishStep } from './steps/PublishStep'

const STEPS: Array<{ id: Step; n: string; label: string }> = [
  { id: 'dados', n: '1', label: 'Dados' },
  { id: 'grafico', n: '2', label: 'Gráfico' },
  { id: 'anotar', n: '3', label: 'Anotar' },
  { id: 'publicar', n: '4', label: 'Publicar' },
]

const STEP_ORDER: Step[] = ['dados', 'grafico', 'anotar', 'publicar']

/** Larguras de preview, no espírito do teste responsivo do Datawrapper. */
const PREVIEW_WIDTHS: Array<{ id: string; label: string; maxWidth: number | null }> = [
  { id: 'auto', label: 'Responsivo', maxWidth: null },
  { id: 'article', label: 'Artigo 760', maxWidth: 760 },
  { id: 'mobile', label: 'Mobile 380', maxWidth: 380 },
]

/**
 * Largura real de um elemento, observada — é ela que alimenta o re-render do
 * gráfico no tamanho do container. Sem isso, o preview "responsivo" seria só
 * um CSS scale: fonte de 12px viraria 6px numa tela de 380px.
 */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState<number | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      const measured = entries[0]?.contentRect.width ?? 0
      if (measured > 0) setWidth(Math.round(measured))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

export function App() {
  const spec = useEditor((s) => s.spec)
  const step = useEditor((s) => s.step)
  const setStep = useEditor((s) => s.setStep)
  const undo = useEditor((s) => s.undo)
  const redo = useEditor((s) => s.redo)
  const canUndo = useEditor((s) => s.past.length > 0)
  const canRedo = useEditor((s) => s.future.length > 0)
  const toast = useEditor((s) => s.toast)
  const showToast = useEditor((s) => s.showToast)
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation)
  const selectAnnotation = useEditor((s) => s.selectAnnotation)
  const removeAnnotation = useEditor((s) => s.removeAnnotation)

  const [presenting, setPresenting] = useState(false)
  const [previewWidth, setPreviewWidth] = useState<string>('auto')
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>()
  const [presentRef, presentWidth] = useElementWidth<HTMLDivElement>()

  const dataset = useMemo(() => selectDataset(spec), [spec])
  const theme = useMemo(
    () => getTheme(spec.theme.id, spec.theme.overrides),
    [spec.theme.id, spec.theme.overrides],
  )

  /**
   * Um erro num renderizador não pode derrubar o editor inteiro e levar o
   * trabalho junto — a cena falha, a interface continua de pé e o problema
   * aparece como aviso.
   */
  const rendered = useMemo(() => {
    try {
      return { scene: renderChart({ spec, dataset, theme }), error: null as string | null }
    } catch (error) {
      return {
        scene: null,
        error: error instanceof Error ? error.message : 'Não foi possível desenhar o gráfico.',
      }
    }
  }, [spec, dataset, theme])

  const issues = useMemo(() => {
    try {
      return lintSpec(spec, dataset, theme)
    } catch {
      return []
    }
  }, [spec, dataset, theme])

  /**
   * Cena do palco, re-renderizada na largura real do container: tipografia em
   * tamanho verdadeiro em qualquer preview. A altura continua a do spec — é o
   * que impede o cromo (cabeçalho, eixos, rodapé) de comer a área de plotagem
   * em telas estreitas. A cena de exportação (`rendered`) permanece nas
   * dimensões do documento.
   */
  const responsiveWidth = Math.max(240, stageWidth ?? spec.layout.width)
  const previewScene = useMemo(() => {
    try {
      return renderChart({ spec, dataset, theme, width: responsiveWidth })
    } catch {
      return null
    }
  }, [spec, dataset, theme, responsiveWidth])

  const presentScene = useMemo(() => {
    if (!presenting) return null
    try {
      return renderChart({
        spec,
        dataset,
        theme,
        width: Math.max(240, presentWidth ?? spec.layout.width),
      })
    } catch {
      return null
    }
  }, [presenting, spec, dataset, theme, presentWidth])

  const stageScene = previewScene ?? rendered.scene

  /** Cena sem nenhuma marca = gráfico vazio; a cena em si só desenha eixos. */
  const hasMarks = useMemo(() => {
    if (!rendered.scene) return false
    const walk = (nodes: SceneNode[]): boolean =>
      nodes.some((node) => node.meta || (node.t === 'g' && walk(node.children)))
    return walk(rendered.scene.nodes)
  }, [rendered.scene])

  /**
   * Etapas "prontas" — heurísticas leves, só para o checkmark guiar o olhar.
   * Dados pronto = tabela com valores mapeados; gráfico pronto = marcas
   * desenhadas; anotar pronto = título com conclusão escrita.
   */
  const completed = useMemo(() => {
    const hasY = spec.encoding.y.length > 0
    return {
      dados: dataset.rows.length > 0 && hasY,
      grafico: hasY && hasMarks,
      anotar: spec.text.title.trim().length > 3,
      publicar: false,
    } as Record<Step, boolean>
  }, [dataset.rows.length, spec.encoding.y.length, spec.text.title, hasMarks])

  const nextStep = STEP_ORDER[STEP_ORDER.indexOf(step) + 1]

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => showToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast, showToast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)

      if (event.key === 'Escape') {
        if (presenting) setPresenting(false)
        else if (selectedAnnotation) selectAnnotation(null)
        return
      }

      if (event.ctrlKey || event.metaKey) {
        const key = event.key.toLowerCase()
        if (key === 'z' && !event.shiftKey) {
          event.preventDefault()
          undo()
        } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
          event.preventDefault()
          redo()
        } else if (key >= '1' && key <= '4') {
          event.preventDefault()
          setStep(STEPS[Number(key) - 1].id)
        }
        return
      }

      // Del remove a anotação selecionada — mas nunca enquanto se digita.
      if (!typing && selectedAnnotation && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault()
        removeAnnotation(selectedAnnotation)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    undo,
    redo,
    setStep,
    presenting,
    selectedAnnotation,
    selectAnnotation,
    removeAnnotation,
  ])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          DataStories <small>gráficos com história</small>
        </div>
        <div className="topbar-spacer" />
        <button type="button" className="btn ghost" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          Desfazer
        </button>
        <button type="button" className="btn ghost" onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
          Refazer
        </button>
        <button type="button" className="btn primary" onClick={() => setPresenting(true)}>
          Apresentar
        </button>
      </header>

      <div className="workspace">
        <aside className="panel">
          <div className="steps" role="tablist">
            {STEPS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                className="step-tab"
                aria-selected={step === item.id}
                onClick={() => setStep(item.id)}
              >
                <span className={'n' + (completed[item.id] ? ' done' : '')}>
                  {completed[item.id] ? '✓' : item.n}
                </span>
                {item.label}
              </button>
            ))}
          </div>

          <div className="panel-body">
            {step === 'dados' && <DataStep spec={spec} dataset={dataset} />}
            {step === 'grafico' && <ChartStep spec={spec} dataset={dataset} />}
            {step === 'anotar' && <AnnotateStep spec={spec} dataset={dataset} theme={theme} />}
            {step === 'publicar' && rendered.scene && (
              <PublishStep spec={spec} scene={rendered.scene} />
            )}

            {nextStep && (
              <div className="panel-next">
                <button
                  type="button"
                  className="btn primary next"
                  onClick={() => setStep(nextStep)}
                >
                  Continuar: {STEPS.find((s) => s.id === nextStep)?.label} →
                </button>
              </div>
            )}
          </div>
        </aside>

        <main className="stage">
          {stageScene ? (
            <div
              ref={stageRef}
              className="stage-canvas"
              style={{
                maxWidth:
                  PREVIEW_WIDTHS.find((p) => p.id === previewWidth)?.maxWidth ?? 1200,
              }}
            >
              <Canvas scene={stageScene} spec={spec} />
              {!hasMarks && (
                <div className="empty-overlay">
                  <strong>Nenhuma coluna de valores no gráfico</strong>
                  <p>Escolha quais colunas numéricas devem ser desenhadas.</p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={() => setStep('grafico')}
                    >
                      Escolher colunas de valores
                    </button>
                    <button type="button" className="btn" onClick={() => setStep('dados')}>
                      Corrigir tipos dos dados
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="empty" style={{ maxWidth: 460 }}>
              {rendered.error}
            </div>
          )}

          <div className="stage-toolbar">
            <div className="chip-row" role="group" aria-label="Largura de preview">
              {PREVIEW_WIDTHS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="chip"
                  aria-pressed={previewWidth === preset.id}
                  onClick={() => setPreviewWidth(preset.id)}
                >
                  <span className="label">{preset.label}</span>
                </button>
              ))}
            </div>
            <span className="toolbar-meta">
              {spec.layout.width} × {spec.layout.height} px · {dataset.rows.length} linha(s),
              {' '}{dataset.columns.length} coluna(s)
            </span>
          </div>

          <div style={{ width: 'min(100%, 760px)' }}>
            <LintPanel issues={issues} />
          </div>
        </main>
      </div>

      {presenting && rendered.scene && (
        <div className="presentation" role="dialog" aria-modal="true">
          <button
            type="button"
            className="presentation-close"
            onClick={() => setPresenting(false)}
            title="Fechar (Esc)"
          >
            fechar ✕
          </button>
          <div className="presentation-stage" onClick={() => setPresenting(false)}>
            <div className="presentation-chart" onClick={(e) => e.stopPropagation()} ref={presentRef}>
              <Canvas scene={presentScene ?? rendered.scene!} spec={spec} />
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
