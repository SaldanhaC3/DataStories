/**
 * Estado do editor.
 *
 * O documento é um `ChartSpec` imutável; toda alteração produz um novo objeto.
 * Isso torna desfazer/refazer trivial (uma pilha de specs) e o autosave
 * honesto (serializar o que está na tela).
 *
 * O detalhe que faz diferença no uso: alterações de digitação são fundidas por
 * `coalesceKey`. Sem isso, um Ctrl+Z depois de escrever um título voltaria uma
 * letra por vez.
 */

import { create } from 'zustand'
import type { Annotation, ChartSpec, Dataset } from '../core/types'
import { createDefaultSpec, newId, parseSpec } from '../core/schema'
import { deriveDataset } from '../core/dataset/transform'

export type Step = 'dados' | 'grafico' | 'anotar' | 'publicar'

const STORAGE_KEY = 'datastories:rascunho'
const COALESCE_MS = 700
const HISTORY_LIMIT = 80

export interface UpdateOptions {
  /** Não registra no histórico (ex.: arrastar em andamento). */
  silent?: boolean
  /**
   * Alterações seguidas com a mesma chave viram uma única entrada no
   * histórico, desde que dentro da janela de tempo.
   */
  coalesceKey?: string
}

interface EditorState {
  spec: ChartSpec
  past: ChartSpec[]
  future: ChartSpec[]
  step: Step
  selectedAnnotation: string | null
  /** Mensagem efêmera mostrada no rodapé do painel. */
  toast: string | null

  update: (mutate: (draft: ChartSpec) => void, options?: UpdateOptions) => void
  replaceSpec: (spec: ChartSpec, options?: { resetHistory?: boolean }) => void
  loadFromJson: (text: string) => { ok: boolean; error: string | null }
  undo: () => void
  redo: () => void
  setStep: (step: Step) => void
  selectAnnotation: (id: string | null) => void
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
  showToast: (message: string | null) => void
  reset: () => void
}

let lastCoalesce: { key: string; at: number } | null = null

function clone(spec: ChartSpec): ChartSpec {
  // `structuredClone` existe em todos os navegadores alvo e é bem mais rápido
  // que o truque do JSON para objetos deste tamanho.
  return typeof structuredClone === 'function'
    ? structuredClone(spec)
    : (JSON.parse(JSON.stringify(spec)) as ChartSpec)
}

function loadInitial(): ChartSpec {
  if (typeof localStorage !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const result = parseSpec(saved)
      if (result.ok && result.spec) return result.spec
    }
  }
  return createDefaultSpec()
}

function persist(spec: ChartSpec): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(spec))
  } catch {
    // Cota estourada com uma tabela muito grande: perder o autosave é melhor
    // que derrubar o editor.
  }
}

export const useEditor = create<EditorState>((set, get) => ({
  spec: loadInitial(),
  past: [],
  future: [],
  step: 'dados',
  selectedAnnotation: null,
  toast: null,

  update: (mutate, options = {}) => {
    const { spec, past } = get()
    const draft = clone(spec)
    mutate(draft)

    const now = Date.now()
    const coalescing =
      options.coalesceKey !== undefined &&
      lastCoalesce !== null &&
      lastCoalesce.key === options.coalesceKey &&
      now - lastCoalesce.at < COALESCE_MS

    lastCoalesce = options.coalesceKey
      ? { key: options.coalesceKey, at: now }
      : null

    const nextPast =
      options.silent || coalescing ? past : [...past, spec].slice(-HISTORY_LIMIT)

    persist(draft)
    set({ spec: draft, past: nextPast, future: [] })
  },

  replaceSpec: (next, options = {}) => {
    const { spec, past } = get()
    persist(next)
    set({
      spec: next,
      past: options.resetHistory ? [] : [...past, spec].slice(-HISTORY_LIMIT),
      future: [],
      selectedAnnotation: null,
    })
  },

  loadFromJson: (text) => {
    const result = parseSpec(text)
    if (!result.ok || !result.spec) {
      return { ok: false, error: result.error }
    }
    get().replaceSpec(result.spec, { resetHistory: true })
    return { ok: true, error: null }
  },

  undo: () => {
    const { past, spec, future } = get()
    if (past.length === 0) return
    const previous = past[past.length - 1]
    lastCoalesce = null
    persist(previous)
    set({ spec: previous, past: past.slice(0, -1), future: [spec, ...future] })
  },

  redo: () => {
    const { past, spec, future } = get()
    if (future.length === 0) return
    const next = future[0]
    lastCoalesce = null
    persist(next)
    set({ spec: next, past: [...past, spec], future: future.slice(1) })
  },

  setStep: (step) => set({ step }),
  selectAnnotation: (id) => set({ selectedAnnotation: id }),

  addAnnotation: (annotation) => {
    get().update((draft) => {
      draft.annotations.push(annotation)
    })
    set({ selectedAnnotation: annotation.id })
  },

  removeAnnotation: (id) => {
    get().update((draft) => {
      draft.annotations = draft.annotations.filter((a) => a.id !== id)
    })
    set((state) => ({
      selectedAnnotation: state.selectedAnnotation === id ? null : state.selectedAnnotation,
    }))
  },

  showToast: (message) => set({ toast: message }),

  reset: () => {
    const fresh = createDefaultSpec()
    persist(fresh)
    lastCoalesce = null
    set({ spec: fresh, past: [], future: [], selectedAnnotation: null, step: 'dados' })
  },
}))

/**
 * Dataset derivado, memorizado pela identidade de `data` e `transform`.
 * Recalcular a inferência de tipos a cada tecla digitada num título seria
 * desperdício visível em tabelas grandes.
 */
let cache: { data: unknown; transform: unknown; dataset: Dataset } | null = null

export function selectDataset(spec: ChartSpec): Dataset {
  if (cache && cache.data === spec.data && cache.transform === spec.transform) {
    return cache.dataset
  }
  const dataset = deriveDataset(spec.data, spec.transform)
  cache = { data: spec.data, transform: spec.transform, dataset }
  return dataset
}

export { newId }
