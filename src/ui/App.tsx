/**
 * Casca do editor: barra superior, painel de quatro etapas e a tela.
 *
 * A cena é recalculada a cada mudança do spec. Isso é barato porque os
 * renderizadores são funções puras sobre estruturas pequenas — e é o que
 * permite ver o efeito de cada ajuste no mesmo instante, que é o ponto todo de
 * uma ferramenta de acabamento.
 */

import { useEffect, useMemo } from 'react'
import { renderChart } from '../core/render'
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

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => showToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast, showToast])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        undo()
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

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
            <Canvas scene={rendered.scene} spec={spec} />
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

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
