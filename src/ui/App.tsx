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
  { id: 'doc', label: 'Documento', maxWidth: null },
  { id: 'article', label: 'Artigo 760', maxWidth: 760 },
  { id: 'mobile', label: 'Mobile 380', maxWidth: 380 },
]

const LAYOUT_MIN = { width: 240, height: 200 }
const LAYOUT_MAX = { width: 1600, height: 2000 }

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value))

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
  const saveState = useEditor((s) => s.saveState)
  const selectedAnnotation = useEditor((s) => s.selectedAnnotation)
  const selectAnnotation = useEditor((s) => s.selectAnnotation)
  const removeAnnotation = useEditor((s) => s.removeAnnotation)
  const update = useEditor((s) => s.update)

  const [presenting, setPresenting] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [previewWidth, setPreviewWidth] = useState<string>('auto')
  const [stageRef, stageWidth] = useElementWidth<HTMLDivElement>()
  const [presentRef, presentWidth] = useElementWidth<HTMLDivElement>()

  /**
   * Arrasto do canto do palco para redimensionar o documento. Guarda o
   * tamanho no início do gesto: o delta do cursor vira largura/altura novas,
   * e a chave de coalescência faz o arrasto inteiro virar um só Ctrl+Z.
   */
  const resizeGesture = useRef<{
    pointerId: number
    startX: number
    startY: number
    width: number
    height: number
  } | null>(null)

  // Referências para devolver o foco a quem abriu um diálogo (apresentação
  // ou ajuda) e para prender o Tab dentro dele enquanto estiver aberto.
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const presentationRef = useRef<HTMLDivElement | null>(null)
  const presentationCloseRef = useRef<HTMLButtonElement | null>(null)
  const presentationReturnFocus = useRef<HTMLElement | null>(null)
  const helpPanelRef = useRef<HTMLDivElement | null>(null)
  const helpCloseRef = useRef<HTMLButtonElement | null>(null)
  const helpReturnFocus = useRef<HTMLElement | null>(null)
  /** Garante que o toast de "autosave falhou" apareça uma única vez. */
  const saveFailureWarned = useRef(false)

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

  function onResizeStart(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // sem captura, o arrasto ainda funciona enquanto o cursor estiver no canto
    }
    // O primeiro arrasto troca o preview para o tamanho do documento: é ele
    // que o gesto controla, e é nele que 1px de cursor = 1px de documento.
    setPreviewWidth('doc')
    resizeGesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: spec.layout.width,
      height: spec.layout.height,
    }
  }

  function onResizeMove(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = resizeGesture.current
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const width = clamp(gesture.width + event.clientX - gesture.startX, LAYOUT_MIN.width, LAYOUT_MAX.width)
    const height = clamp(gesture.height + event.clientY - gesture.startY, LAYOUT_MIN.height, LAYOUT_MAX.height)
    update(
      (draft) => {
        draft.layout.width = Math.round(width)
        draft.layout.height = Math.round(height)
      },
      { coalesceKey: 'layout-resize' },
    )
  }

  function onResizeEnd(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizeGesture.current || event.pointerId !== resizeGesture.current.pointerId) return
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // nada a liberar
    }
    resizeGesture.current = null
  }

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

  // Só o toast de sucesso some sozinho — erro fica até a pessoa fechar,
  // porque é o único canal de feedback do app e um erro perdido em 3,2s vira
  // trabalho perdido sem explicação.
  useEffect(() => {
    if (!toast || toast.kind !== 'ok') return
    const timer = setTimeout(() => showToast(null), 3200)
    return () => clearTimeout(timer)
  }, [toast, showToast])

  // Primeira falha de autosave: um único aviso sugerindo baixar o arquivo.
  // Depois disso o texto discreto da topbar já basta — repetir o toast a
  // cada tecla seria mais irritante que informativo.
  useEffect(() => {
    if (saveState === 'falhou' && !saveFailureWarned.current) {
      saveFailureWarned.current = true
      showToast({
        message:
          'Não foi possível salvar automaticamente. Baixe o arquivo do projeto na etapa Publicar para não perder o trabalho.',
        kind: 'erro',
      })
    }
  }, [saveState, showToast])

  // Apresentação e ajuda são diálogos modais: o foco precisa entrar neles ao
  // abrir e voltar para quem os abriu ao fechar, senão o teclado continua
  // "atrás" do overlay, invisível.
  useEffect(() => {
    if (presenting) {
      presentationReturnFocus.current = document.activeElement as HTMLElement | null
      presentationCloseRef.current?.focus()
    } else if (presentationReturnFocus.current) {
      presentationReturnFocus.current.focus()
      presentationReturnFocus.current = null
    }
  }, [presenting])

  useEffect(() => {
    if (helpOpen) {
      helpReturnFocus.current = document.activeElement as HTMLElement | null
      helpCloseRef.current?.focus()
    } else if (helpReturnFocus.current) {
      helpReturnFocus.current.focus()
      helpReturnFocus.current = null
    }
  }, [helpOpen])

  /** Prende o Tab dentro de um diálogo aberto, ciclando entre os focáveis. */
  function trapTab(event: React.KeyboardEvent, container: HTMLElement | null) {
    if (event.key !== 'Tab' || !container) return
    const focusables = container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    if (focusables.length === 0) return
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  /** Navegação por seta/Home/End entre as abas, com foco programático (roving tabindex). */
  function onTabKeyDown(event: React.KeyboardEvent, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % STEPS.length
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + STEPS.length) % STEPS.length
    else if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = STEPS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    setStep(STEPS[nextIndex].id)
    tabRefs.current[nextIndex]?.focus()
  }

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
        else if (helpOpen) setHelpOpen(false)
        else if (toast?.kind === 'erro') showToast(null)
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
    helpOpen,
    toast,
    showToast,
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
        <span className="save-state" aria-live="polite">
          {saveState === 'salvo' && 'salvo'}
          {saveState === 'salvando' && 'salvando…'}
          {saveState === 'falhou' && 'não foi possível salvar — baixe o arquivo'}
        </span>
        <button type="button" className="btn ghost" onClick={undo} disabled={!canUndo} title="Ctrl+Z">
          Desfazer
        </button>
        <button type="button" className="btn ghost" onClick={redo} disabled={!canRedo} title="Ctrl+Shift+Z">
          Refazer
        </button>
        <button
          type="button"
          className="btn ghost"
          aria-label="Atalhos e gestos"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
        <button type="button" className="btn primary" onClick={() => setPresenting(true)}>
          Apresentar
        </button>
      </header>

      <div className="workspace">
        <aside className="panel">
          <div className="steps" role="tablist">
            {STEPS.map((item, index) => (
              <button
                key={item.id}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                id={'tab-' + item.id}
                aria-controls="painel-etapa"
                aria-selected={step === item.id}
                tabIndex={step === item.id ? 0 : -1}
                className="step-tab"
                onClick={() => setStep(item.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
              >
                <span className={'n' + (completed[item.id] ? ' done' : '')}>
                  {completed[item.id] ? '✓' : item.n}
                </span>
                {item.label}
              </button>
            ))}
          </div>

          <div
            className="panel-body"
            role="tabpanel"
            id="painel-etapa"
            tabIndex={0}
            aria-labelledby={'tab-' + step}
          >
            {step === 'dados' && <DataStep spec={spec} dataset={dataset} />}
            {step === 'grafico' && <ChartStep spec={spec} dataset={dataset} />}
            {step === 'anotar' && <AnnotateStep spec={spec} dataset={dataset} theme={theme} />}
            {step === 'publicar' &&
              (rendered.scene ? (
                <PublishStep spec={spec} scene={rendered.scene} />
              ) : (
                <div className="empty-overlay">
                  <strong>Não dá para exportar enquanto o gráfico não desenha</strong>
                  <p>{rendered.error}</p>
                  <div className="row">
                    <button
                      type="button"
                      className="btn primary"
                      onClick={undo}
                      disabled={!canUndo}
                    >
                      Desfazer a última mudança
                    </button>
                    <button type="button" className="btn" onClick={() => setStep('grafico')}>
                      Voltar para Gráfico
                    </button>
                  </div>
                </div>
              ))}

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
                  previewWidth === 'doc'
                    ? spec.layout.width
                    : PREVIEW_WIDTHS.find((p) => p.id === previewWidth)?.maxWidth ?? 1200,
              }}
            >
              <Canvas scene={stageScene} spec={spec} />
              <div
                className="resize-handle"
                role="separator"
                aria-label="Redimensionar o gráfico"
                title="Arraste para redimensionar o documento"
                onPointerDown={onResizeStart}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeEnd}
                onPointerCancel={onResizeEnd}
              />
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
            <div className="empty empty-overlay" style={{ maxWidth: 460 }}>
              <strong>Não foi possível desenhar o gráfico</strong>
              <p>{rendered.error}</p>
              <div className="row">
                <button type="button" className="btn primary" onClick={undo} disabled={!canUndo}>
                  Desfazer a última mudança
                </button>
                <button type="button" className="btn" onClick={() => setStep('grafico')}>
                  Voltar para Gráfico
                </button>
              </div>
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
        <div
          className="presentation"
          role="dialog"
          aria-modal="true"
          aria-labelledby="presentation-title"
          ref={presentationRef}
          onKeyDown={(event) => trapTab(event, presentationRef.current)}
        >
          <h2 id="presentation-title" className="sr-only">
            Apresentação em tela cheia
          </h2>
          <button
            type="button"
            className="presentation-close"
            onClick={() => setPresenting(false)}
            title="Fechar (Esc)"
            ref={presentationCloseRef}
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

      {helpOpen && (
        <div
          className="help-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="help-panel-title"
          ref={helpPanelRef}
          onKeyDown={(event) => trapTab(event, helpPanelRef.current)}
        >
          <div className="help-panel-body" onClick={(e) => e.stopPropagation()}>
            <header className="help-panel-header">
              <h2 id="help-panel-title">Atalhos e gestos</h2>
              <button
                type="button"
                aria-label="Fechar ajuda"
                onClick={() => setHelpOpen(false)}
                ref={helpCloseRef}
              >
                ✕
              </button>
            </header>
            <div className="help-panel-content">
              <section>
                <h3>Atalhos de teclado</h3>
                <ul>
                  <li><kbd>Ctrl</kbd>+<kbd>1</kbd>…<kbd>4</kbd> — ir para a etapa</li>
                  <li><kbd>Ctrl</kbd>+<kbd>Z</kbd> — desfazer</li>
                  <li><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> (ou <kbd>Ctrl</kbd>+<kbd>Y</kbd>) — refazer</li>
                  <li><kbd>Delete</kbd> ou <kbd>Backspace</kbd> — remover a anotação selecionada</li>
                  <li><kbd>Esc</kbd> — fechar diálogos, avisos e seleção</li>
                  <li>Setas ←/→, <kbd>Home</kbd>, <kbd>End</kbd> — navegar entre as abas de etapa</li>
                </ul>
              </section>
              <section>
                <h3>Gestos no gráfico</h3>
                <ul>
                  <li>Clique na marca de dados — destaca o ponto no gráfico</li>
                  <li>Clique no título do gráfico — abre a edição do texto na etapa Anotar</li>
                  <li>Arrastar uma anotação — reposiciona ela sobre o gráfico</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      <div className="toast-region" role="status" aria-live="polite" aria-atomic="true">
        {toast && toast.kind === 'ok' && (
          <div className="toast">
            <span>{toast.message}</span>
            {toast.action && (
              <button type="button" className="toast-action" onClick={toast.action.run}>
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="toast-region" role="alert" aria-live="assertive" aria-atomic="true">
        {toast && toast.kind === 'erro' && (
          <div className="toast erro">
            <span>{toast.message}</span>
            {toast.action && (
              <button type="button" className="toast-action" onClick={toast.action.run}>
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Fechar aviso" onClick={() => showToast(null)}>
              ✕
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
