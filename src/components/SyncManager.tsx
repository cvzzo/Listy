import { useEffect } from 'react'
import { db } from '../lib/db/db'
import { reconcileIntoDexie } from '../lib/sync/reconcile'
import { startSyncEngine } from '../lib/sync/engine'
import { useFamilyChannel } from '../hooks/useFamilyChannel'

function SyncManager() {
  useEffect(() => {
    startSyncEngine()
  }, [])

  useFamilyChannel((event) => {
    if (event.entity === 'list') reconcileIntoDexie(db.lists, event.row)
    if (event.entity === 'category') reconcileIntoDexie(db.categories, event.row)
    if (event.entity === 'item') reconcileIntoDexie(db.items, event.row)
  })

  return null
}

export default SyncManager
