/**
 * Painel do linter.
 *
 * Nenhum aviso bloqueia nada. Cada um leva à etapa onde se resolve, e traz a
 * razão junto — aviso sem motivo vira ruído que se aprende a ignorar, e aí a
 * ferramenta perde justamente o que ela tem de diferente.
 */

import type { LintIssue } from '../advisor/lint'
import { useEditor } from '../state/store'

export function LintPanel({ issues }: { issues: LintIssue[] }) {
  const setStep = useEditor((s) => s.setStep)

  if (issues.length === 0) {
    return (
      <div className="lint-clean">
        <span aria-hidden="true">✓</span>
        Nada a apontar. O gráfico está dentro das convenções editoriais.
      </div>
    )
  }

  return (
    <div className="lint">
      {issues.map((issue) => (
        <button
          key={issue.id}
          type="button"
          className="lint-item"
          onClick={() => setStep(issue.step)}
          title={`Ir para a etapa ${issue.step}`}
        >
          <span className={`lint-dot ${issue.severity}`} aria-hidden="true" />
          <span>
            <strong>{issue.title}</strong>
            <span>{issue.detail}</span>
          </span>
        </button>
      ))}
    </div>
  )
}
