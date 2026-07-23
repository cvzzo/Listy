import { useEffect, useRef, useState } from 'react'

const TOAST_DURATION_MS = 5000

type PendingUndo = {
  message: string
  restore: () => void | Promise<void>
}

export function useUndoToast() {
  const [pending, setPending] = useState<PendingUndo | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  function showUndo(message: string, restore: () => void | Promise<void>) {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPending({ message, restore })
    timerRef.current = setTimeout(() => setPending(null), TOAST_DURATION_MS)
  }

  async function confirmUndo() {
    if (timerRef.current) clearTimeout(timerRef.current)
    const current = pending
    setPending(null)
    if (current) await current.restore()
  }

  function dismiss() {
    if (timerRef.current) clearTimeout(timerRef.current)
    setPending(null)
  }

  return { pending, showUndo, confirmUndo, dismiss }
}
