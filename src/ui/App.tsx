/**
 * Casca do editor: barra superior, painel de quatro etapas e a tela.
 *
 * A cena é recalculada a cada mudança do spec. Isso é barato porque os
 * renderizadores são funções puras sobre estruturas pequenas — e é o que
 * permite ver o efeito de cada ajuste no mesmo instante, que é o ponto todo de
 * uma ferramenta de acabamento.
 */

import { useEffect, useMemo, useState } from 'react'
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

  /** Cena sem nenhuma marca = gráfico vazio; a cena em si só desenha eixos. */
  const hasMarks = useMemo(() => {
    if (!rendered.scene) return false
    const walk = (nodes: SceneNode[]): boolean =>
      nodes.some((node) => node.meta || (node.t === 'g' && walk(node.children)))
    return walk(rendered.scene.nodes)
  }, [rendered.scene])

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
                <span className="n">{item.n}</span>
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
          </div>
        </aside>

        <main className="stage">
          {rendered.scene ? (
            <div className="stage-canvas">
              <Canvas scene={rendered.scene} spec={spec} />
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
            <span>
              {spec.layout.width} × {spec.layout.height} px
            </span>
            <span>·</span>
            <span>
              {dataset.rows.length} linha(s), {dataset.columns.length} coluna(s)
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
            <div className="presentation-chart" onClick={(e) => e.stopPropagation()}>
              <Canvas scene={rendered.scene} spec={spec} />
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
