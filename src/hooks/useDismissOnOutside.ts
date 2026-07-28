import { useEffect, useRef, type RefObject } from 'react'

/**
 * Chiude un elemento temporaneo (menu, modulo inline) quando si tocca fuori da esso
 * o si preme Escape. Su telefono il tocco fuori e l'unico gesto che le persone
 * provano davvero per uscire da qualcosa che si e aperto.
 */
export function useDismissOnOutside(
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  active: boolean,
  /**
   * Selettore dei controlli che riaprono l'elemento da soli. Senza questa deroga
   * il tocco chiuderebbe prima, il contenuto sotto risalirebbe, e il click
   * finirebbe su cio che nel frattempo si e spostato sotto il dito.
   */
  ignoreSelector?: string,
) {
  const handlerRef = useRef(onDismiss)

  useEffect(() => {
    handlerRef.current = onDismiss
  })

  useEffect(() => {
    if (!active) return

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element | null
      if (ref.current?.contains(target)) return
      if (ignoreSelector && target?.closest?.(ignoreSelector)) return
      handlerRef.current()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') handlerRef.current()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [ref, active, ignoreSelector])
}
