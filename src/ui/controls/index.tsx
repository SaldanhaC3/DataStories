/**
 * Controles de formulário reutilizados pelas quatro etapas.
 *
 * Todos são controlados e recebem `onChange` com o valor já tipado — as etapas
 * não lidam com `event.target.value`, o que mantém a lógica de edição do spec
 * legível.
 */

import type { ReactNode } from 'react'

interface FieldProps {
  label?: string
  hint?: string
  children: ReactNode
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
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
  return (
    <input
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
  return (
    <textarea
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
  return (
    <input
      type="number"
      value={value ?? ''}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const raw = e.target.value
        onChange(raw === '' ? null : Number(raw))
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
  return (
    <select
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
  return (
    <div className="segmented" role="group">
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
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
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
  return (
    <div className="row" style={{ alignItems: 'center' }}>
      <input
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
