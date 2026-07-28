import { useEffect, useRef, useState } from 'react'
import { db } from '../lib/db/db'
import { getSession } from '../lib/auth/session'
import { reconcileIntoDexie } from '../lib/sync/reconcile'
import { describeItemChange } from '../lib/sync/describeChange'
import { startSyncEngine } from '../lib/sync/engine'
import { useFamilyChannel } from '../hooks/useFamilyChannel'

const NOTICE_DURATION_MS = 4000

function SyncManager() {
  const [notice, setNotice] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    startSyncEngine()
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function announce(text: string) {
    if (timer.current) clearTimeout(timer.current)
    setNotice(text)
    timer.current = setTimeout(() => setNotice(null), NOTICE_DURATION_MS)
  }

  useFamilyChannel(async (event) => {
    if (event.entity === 'list') {
      await reconcileIntoDexie(db.lists, event.row)
      return
    }
    if (event.entity === 'category') {
      await reconcileIntoDexie(db.categories, event.row)
      return
    }

    // La riga di prima serve per capire cosa e cambiato, quindi va letta
    // necessariamente prima di sovrascriverla
    const local = await db.items.get(event.row.id)
    const applied = await reconcileIntoDexie(db.items, event.row)

    // Niente annuncio se l'aggiornamento era vecchio, se non sappiamo chi l'ha
    // fatto, o se l'abbiamo fatto noi da un altro dispositivo
    if (!applied || !event.by) return
    if (event.by.id === getSession()?.member.id) return

    const text = describeItemChange(event.by.name, local, event.row)
    if (text) announce(text)
  })

  return notice ? (
    <div className="activity-notice" role="status">
      {notice}
    </div>
  ) : null
}

export default SyncManager
