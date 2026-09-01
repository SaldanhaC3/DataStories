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
/** Janela do debounce de autosave — uma tecla não deve serializar o documento inteiro. */
const PERSIST_DEBOUNCE_MS = 500

export interface UpdateOptions {
  /** Não registra no histórico (ex.: arrastar em andamento). */
  silent?: boolean
  /**
   * Alterações seguidas com a mesma chave viram uma única entrada no
   * histórico, desde que dentro da janela de tempo.
   */
  coalesceKey?: string
}

/** Estado real do autosave, alimentado pelo retorno de `localStorage.setItem`. */
export type SaveState = 'salvo' | 'salvando' | 'falhou'

export interface ToastAction {
  label: string
  run: () => void
}

/** Forma completa de um toast — o que o store guarda. */
export interface Toast {
  message: string
  kind: 'ok' | 'erro'
  action?: ToastAction
}

/** Forma aceita por `showToast` quando não se quer só uma string. */
export interface ToastInput {
  message: string
  kind?: 'ok' | 'erro'
  action?: ToastAction
}

/**
 * Um item de histórico guarda a etapa junto do spec. Sem isso, desfazer um
 * "carregar exemplo" (que também troca a etapa) devolveria o documento antigo
 * mas deixaria a pessoa presa na etapa nova — um desfazer pela metade.
 */
interface HistoryEntry {
  spec: ChartSpec
  step: Step
}

interface EditorState {
  spec: ChartSpec
  past: HistoryEntry[]
  future: HistoryEntry[]
  step: Step
  selectedAnnotation: string | null
  /** Mensagem efêmera mostrada no rodapé do painel. */
  toast: Toast | null
  saveState: SaveState

  update: (mutate: (draft: ChartSpec) => void, options?: UpdateOptions) => void
  replaceSpec: (spec: ChartSpec, options?: { resetHistory?: boolean }) => void
  loadFromJson: (text: string) => { ok: boolean; error: string | null }
  undo: () => void
  redo: () => void
  setStep: (step: Step) => void
  selectAnnotation: (id: string | null) => void
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
  showToast: (input: string | ToastInput | null) => void
  reset: () => void
}

let lastCoalesce: { key: string; at: number } | null = null

/**
 * "Armada" por uma ação destrutiva (replaceSpec fora do boot, reset) para que
 * o próximo `showToast(string)` — chamado logo em seguida pelo código que
 * disparou a ação — ganhe automaticamente um botão "Desfazer". Isso evita
 * precisar reescrever todo chamador de showToast só para anexar a ação.
 */
let armForUndo = false

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

export const useEditor = create<EditorState>((set, get) => {
  // Autosave: debounce de módulo com flush imediato. `pending` é o último
  // spec que ainda não foi escrito no localStorage; `timer` é o agendamento
  // desse escrita. Guardar isso fora do `set` evita recriar o timer a cada
  // render e permite descartar (`flush`) de qualquer lugar do store.
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: ChartSpec | null = null

  function writeNow(spec: ChartSpec): void {
    if (typeof localStorage === 'undefined') return
    set({ saveState: 'salvando' })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(spec))
      set({ saveState: 'salvo' })
    } catch {
      // Cota estourada ou modo privado: a pessoa precisa saber, não descobrir
      // meia hora depois que nada foi salvo. `saveState` carrega essa notícia
      // até a topbar; App.tsx decide como avisar.
      set({ saveState: 'falhou' })
    }
  }

  function schedulePersist(spec: ChartSpec): void {
    pending = spec
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      const toSave = pending
      pending = null
      if (toSave) writeNow(toSave)
    }, PERSIST_DEBOUNCE_MS)
  }

  /** Descarta o debounce e grava imediatamente o que estiver pendente. */
  function flushPersist(): void {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending) {
      const toSave = pending
      pending = null
      writeNow(toSave)
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', flushPersist)
  }

  return {
    spec: loadInitial(),
    past: [],
    future: [],
    step: 'dados',
    selectedAnnotation: null,
    toast: null,
    saveState: 'salvo',

    update: (mutate, options = {}) => {
      const { spec, step, past } = get()
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
        options.silent || coalescing ? past : [...past, { spec, step }].slice(-HISTORY_LIMIT)

      schedulePersist(draft)
      set({ spec: draft, past: nextPast, future: [] })
    },

    replaceSpec: (next, options = {}) => {
      const { spec, step, past } = get()
      // Ação de grande porte (carregar exemplo, abrir projeto): não faz
      // sentido esperar o debounce, e qualquer edição pendente do documento
      // anterior precisa ser gravada antes de trocarmos de spec.
      flushPersist()
      writeNow(next)

      // `resetHistory` só existia para zerar past/future — mas isso é o que
      // torna essas trocas irreversíveis. A única hora em que zerar histórico
      // faz sentido é no boot (que nem passa por `replaceSpec`, lê direto do
      // localStorage). Fora daí, o spec anterior sempre vai para `past`, como
      // qualquer outra edição.
      void options
      armForUndo = true
      set({
        spec: next,
        past: [...past, { spec, step }].slice(-HISTORY_LIMIT),
        future: [],
        selectedAnnotation: null,
      })
    },

    loadFromJson: (text) => {
      const result = parseSpec(text)
      if (!result.ok || !result.spec) {
        return { ok: false, error: result.error }
      }
      get().replaceSpec(result.spec)
      return { ok: true, error: null }
    },

    undo: () => {
      const { past, spec, step, future } = get()
      if (past.length === 0) return
      const previous = past[past.length - 1]
      lastCoalesce = null
      schedulePersist(previous.spec)
      set({
        spec: previous.spec,
        step: previous.step,
        past: past.slice(0, -1),
        future: [{ spec, step }, ...future],
      })
    },

    redo: () => {
      const { past, spec, step, future } = get()
      if (future.length === 0) return
      const next = future[0]
      lastCoalesce = null
      schedulePersist(next.spec)
      set({
        spec: next.spec,
        step: next.step,
        past: [...past, { spec, step }],
        future: future.slice(1),
      })
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

    showToast: (input) => {
      if (input === null) {
        set({ toast: null })
        return
      }
      if (typeof input === 'string') {
        // Forma compatível com todo chamador existente. Se uma ação
        // destrutiva acabou de "armar" o desfazer, anexa o botão aqui —
        // é o único jeito de dar "Desfazer" a chamadores que só passam texto.
        const action: ToastAction | undefined = armForUndo
          ? { label: 'Desfazer', run: () => get().undo() }
          : undefined
        armForUndo = false
        set({ toast: { message: input, kind: 'ok', action } })
        return
      }
      armForUndo = false
      set({ toast: { message: input.message, kind: input.kind ?? 'ok', action: input.action } })
    },

    reset: () => {
      const { spec, step, past } = get()
      const fresh = createDefaultSpec()
      flushPersist()
      writeNow(fresh)
      lastCoalesce = null
      armForUndo = true
      set({
        spec: fresh,
        past: [...past, { spec, step }].slice(-HISTORY_LIMIT),
        future: [],
        selectedAnnotation: null,
        step: 'dados',
      })
    },
  }
})

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
