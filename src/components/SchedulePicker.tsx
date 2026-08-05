import { useEffect, useState } from 'react'
import { fromInputValue, toInputValue } from '../lib/format/when'

type SchedulePickerProps = {
  open: boolean
  listName: string
  value: string | null | undefined
  onSave: (iso: string | null) => void
  onCancel: () => void
}

/**
 * Il modulo sta in un componente a parte perche SchedulePicker non lo monta finche
 * e chiuso: cosi la bozza riparte dal valore salvato a ogni apertura, senza doverla
 * riallineare da un effetto.
 */
function ScheduleForm({ listName, value, onSave, onCancel }: Omit<SchedulePickerProps, 'open'>) {
  const [draft, setDraft] = useState(() => toInputValue(value))

  return (
    <>
      <h2>Quando andare?</h2>
      <p>Lo vedra tutta la famiglia accanto a "{listName}".</p>

      <label className="modal-field">
        Data e ora
        <input
          type="datetime-local"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
      </label>

      <div className="modal-actions">
        {value ? (
          <button type="button" className="btn-secondary" onClick={() => onSave(null)}>
            Togli
          </button>
        ) : (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Annulla
          </button>
        )}
        <button
          type="button"
          className="btn-primary"
          disabled={!draft}
          onClick={() => onSave(fromInputValue(draft))}
        >
          Salva
        </button>
      </div>
    </>
  )
}

function SchedulePicker({ open, listName, value, onSave, onCancel }: SchedulePickerProps) {
  useEffect(() => {
    if (!open) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label={`Quando fare la spesa di ${listName}`}
        onClick={(e) => e.stopPropagation()}
      >
        <ScheduleForm listName={listName} value={value} onSave={onSave} onCancel={onCancel} />
      </div>
    </div>
  )
}

export default SchedulePicker
