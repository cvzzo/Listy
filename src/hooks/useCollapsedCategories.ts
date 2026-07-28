import { useState } from 'react'

const STORAGE_KEY = 'listy.collapsedCategories'

function read(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

/**
 * Quali reparti sono chiusi e una preferenza di visualizzazione del singolo
 * dispositivo, non un dato della famiglia: sta in localStorage e non passa dal
 * motore di sincronizzazione. Chiudere "Surgelati" sul tuo telefono non deve
 * chiuderlo anche a chi sta girando per il negozio con il suo.
 */
export function useCollapsedCategories() {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(read()))

  function toggle(key: string) {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)

    setCollapsed(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]))
    } catch {
      // storage pieno o negato: la lista funziona lo stesso, si riapre tutto
    }
  }

  function expand(key: string) {
    if (collapsed.has(key)) toggle(key)
  }

  return { isCollapsed: (key: string) => collapsed.has(key), toggle, expand }
}
