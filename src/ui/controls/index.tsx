/**
 * Controles de formulário reutilizados pelas quatro etapas.
 *
 * Todos são controlados e recebem `onChange` com o valor já tipado — as etapas
 * não lidam com `event.target.value`, o que mantém a lógica de edição do spec
 * legível.
 */

import { createContext, useContext, useId } from 'react'
import type { ReactNode } from 'react'

interface FieldProps {
  label?: string
  hint?: string
  children: ReactNode
}

interface FieldContextValue {
  /** Id do controle — vira `htmlFor` do label e `id` do input. */
  id: string
  /** Id do próprio `<label>`, para controles como `Segmented` que usam `aria-labelledby` em vez de `htmlFor` (não há um único input para apontar). */
  labelId?: string
  /** Id do `hint`, para `aria-describedby`. */
  describedBy?: string
}

// Contexto pequeno em vez de `cloneElement`: os filhos de `Field` variam entre
// um input só, um grupo de botões (`Segmented`) ou um par input+botão
// (`ColorInput`), e `cloneElement` só funciona de forma previsível com um
// elemento único.
const FieldContext = createContext<FieldContextValue | null>(null)

/** Usado pelos próprios controles para herdar id/aria-describedby do `Field` ao redor, sem exigir props extras em cada chamada nas etapas. */
function useFieldContext() {
  return useContext(FieldContext)
}

export function Field({ label, hint, children }: FieldProps) {
  const id = useId()
  const labelId = label ? `${id}-label` : undefined
  const describedBy = hint ? `${id}-hint` : undefined
  return (
    <div className="field">
      {label && (
        <label id={labelId} htmlFor={id}>
          {label}
        </label>
      )}
      <FieldContext.Provider value={{ id, labelId, describedBy }}>{children}</FieldContext.Provider>
      {hint && (
        <span className="hint" id={describedBy}>
          {hint}
        </span>
      )}
    </div>
  )
}

export function Group({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="group">
      {title && <h3>{title}</h3>}
      {children}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: 'text' | 'number'
}) {
  const field = useFieldContext()
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy}
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  const field = useFieldContext()
  return (
    <textarea
      id={field?.id}
      aria-describedby={field?.describedBy}
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

/** Campo numérico que aceita vazio como `null`, para limites opcionais de eixo. */
export function NumberInput({
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  value: number | null
  onChange: (value: number | null) => void
  placeholder?: string
  min?: number
  max?: number
  step?: number
}) {
  const field = useFieldContext()
  return (
    <input
      id={field?.id}
      aria-describedby={field?.describedBy}
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '') return onChange(null)
        const n = Number(raw)
        // `min`/`max` do HTML são só uma dica visual do spinner — não impedem
        // digitação. O clamp mora aqui, e não no reducer, porque o render
        // acontece a cada tecla: o spec não pode ver um valor absurdo nem por
        // um instante.
        if (Number.isNaN(n)) return onChange(null)
        let clamped = n
        if (min != null) clamped = Math.max(min, clamped)
        if (max != null) clamped = Math.min(max, clamped)
        onChange(clamped)
      }}
    />
  )
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  allowEmpty,
  emptyLabel = '—',
}: {
  value: T | null
  options: Array<{ value: T; label: string }>
  onChange: (value: T | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
}) {
  const field = useFieldContext()
  return (
    <select
      id={field?.id}
      aria-describedby={field?.describedBy}
      value={value ?? ''}
      onChange={(e) => onChange((e.target.value || null) as T | null)}
    >
      {allowEmpty && <option value="">{emptyLabel}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
}) {
  const field = useFieldContext()
  return (
    // Grupo de botões, não um único input: não há elemento para receber
    // `htmlFor`, então o rótulo do `Field` se conecta por `aria-labelledby`.
    <div className="segmented" role="group" aria-labelledby={field?.labelId} aria-describedby={field?.describedBy}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}) {
  const field = useFieldContext()
  return (
    // O input já mora dentro do próprio <label>, então o rótulo do `Field`
    // (quando existe) não deve se repetir aqui — só o hint é herdado.
    <label className="toggle">
      <input
        type="checkbox"
        aria-describedby={field?.describedBy}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  )
}

export function ColorInput({
  value,
  onChange,
  fallback,
}: {
  value: string | null
  onChange: (value: string | null) => void
  fallback: string
}) {
  const field = useFieldContext()
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <input
        id={field?.id}
        aria-describedby={field?.describedBy}
        type="color"
        value={value ?? fallback}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: '0 0 40px', height: 30, padding: 2, cursor: 'pointer' }}
      />
      <button type="button" className="btn tiny ghost" onClick={() => onChange(null)}>
        usar cor do tema
      </button>
    </div>
  )
}

/** Botão-pílula usado nas listas de série e categoria. */
export function Chip({
  label,
  color,
  active,
  onClick,
}: {
  label: string
  color?: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick} title={label}>
      {color && <span className="swatch" style={{ background: color }} />}
      <span className="label">{label}</span>
    </button>
  )
}
