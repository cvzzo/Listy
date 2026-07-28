import { useRef, useState } from 'react'
import { applyChanges, type Change } from '../lib/history/changes'

export type HistoryEntry = {
  /** Descrizione al passato, es. «Spuntato "Mele"»: finisce nel menu accanto ad Annulla */
  label: string
  forward: Change[]
  backward: Change[]
}

type Stacks = { past: HistoryEntry[]; future: HistoryEntry[] }

// Oltre questa soglia le azioni piu vecchie cadono: nessuno torna indietro di
// cinquanta passi, e tenerle tutte fa solo crescere la memoria
const MAX_ENTRIES = 50

/**
 * Cronologia delle azioni della lista, in memoria per la sessione corrente.
 * Non sopravvive al ricaricamento: le Change sono dati serializzabili, quindi si
 * potrebbe persistere, ma una cronologia ripescata da ieri che si scontra con le
 * modifiche arrivate nel frattempo dagli altri dispositivi crea piu danni di quanti
 * ne eviti.
 */
export function useActionHistory() {
  // Le pile vivono nel ref, lo stato serve solo a ridisegnare le etichette del menu.
  // Serve perche undo puo essere invocata da una funzione catturata prima
  // dell'ultimo render, per esempio dal pulsante "Annulla" del toast: leggendo lo
  // stato tramite closure disferebbe l'azione sbagliata, quella precedente.
  const stacks = useRef<Stacks>({ past: [], future: [] })
  const [labels, setLabels] = useState<{ undo: string | null; redo: string | null }>({
    undo: null,
    redo: null,
  })

  function commit(next: Stacks) {
    stacks.current = next
    setLabels({
      undo: next.past[next.past.length - 1]?.label ?? null,
      redo: next.future[0]?.label ?? null,
    })
  }

  /** Registra un'azione gia applicata. Una nuova azione azzera cio che si era disfatto. */
  function record(entry: HistoryEntry) {
    commit({ past: [...stacks.current.past, entry].slice(-MAX_ENTRIES), future: [] })
  }

  async function undo() {
    const { past, future } = stacks.current
    const entry = past[past.length - 1]
    if (!entry) return

    commit({ past: past.slice(0, -1), future: [entry, ...future] })
    await applyChanges(entry.backward)
  }

  async function redo() {
    const { past, future } = stacks.current
    const entry = future[0]
    if (!entry) return

    commit({ past: [...past, entry], future: future.slice(1) })
    await applyChanges(entry.forward)
  }

  return { record, undo, redo, undoLabel: labels.undo, redoLabel: labels.redo }
}
