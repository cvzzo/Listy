import { db, type QueuedMutation } from '../db/db'
import { apiFetch } from '../api/client'
import { reconcileIntoDexie } from './reconcile'
import type { Category, Item, List } from '../types'

type SyncPullResponse = {
  lists: List[]
  categories: Category[]
  items: Item[]
  syncedAt: string
}

type SyncPushResult = {
  id: string
  entity: 'list' | 'category' | 'item'
  status: 'ok' | 'error'
  row?: List | Category | Item
  error?: string
}

const LAST_SYNCED_AT_KEY = 'lastSyncedAt'

async function getLastSyncedAt(): Promise<string> {
  const row = await db.meta.get(LAST_SYNCED_AT_KEY)
  return (row?.value as string) ?? '0'
}

async function setLastSyncedAt(value: string) {
  await db.meta.put({ key: LAST_SYNCED_AT_KEY, value })
}

export async function pullFromServer() {
  const since = await getLastSyncedAt()
  const res = await apiFetch<SyncPullResponse>(`/sync-pull?since=${encodeURIComponent(since)}`)

  await db.transaction('rw', [db.lists, db.categories, db.items], async () => {
    if (res.lists.length) await db.lists.bulkPut(res.lists)
    if (res.categories.length) await db.categories.bulkPut(res.categories)
    if (res.items.length) await db.items.bulkPut(res.items)
  })

  await setLastSyncedAt(res.syncedAt)
}

let flushing = false

export async function flushQueue() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    const pending = await db.mutationQueue.where('status').anyOf(['pending', 'failed']).sortBy('localId')
    if (pending.length === 0) return

    await db.mutationQueue.bulkPut(pending.map((m) => ({ ...m, status: 'sending' })))

    const res = await apiFetch<{ results: SyncPushResult[] }>('/sync-push', {
      method: 'POST',
      body: JSON.stringify({
        mutations: pending.map((m) => ({ id: m.id, entity: m.entity, op: m.op, payload: m.payload })),
      }),
    })

    for (const result of res.results) {
      const queued = pending.find((m) => m.id === result.id && m.entity === result.entity)
      if (queued?.localId === undefined) continue

      if (result.status === 'ok' && result.row) {
        // reconcileIntoDexie (non un put diretto) evita che la risposta di un flush precedente
        // sovrascriva una modifica locale più recente fatta mentre la richiesta era in volo
        // (es. spuntare un articolo offline subito dopo averlo creato online).
        if (result.entity === 'list') await reconcileIntoDexie(db.lists, result.row as List)
        if (result.entity === 'category') await reconcileIntoDexie(db.categories, result.row as Category)
        if (result.entity === 'item') await reconcileIntoDexie(db.items, result.row as Item)
        await db.mutationQueue.delete(queued.localId)
      } else {
        await db.mutationQueue.update(queued.localId, {
          status: 'failed',
          attempts: queued.attempts + 1,
        })
      }
    }
  } catch {
    const stuck = await db.mutationQueue.where('status').equals('sending').toArray()
    await db.mutationQueue.bulkPut(stuck.map((m) => ({ ...m, status: 'pending' })))
  } finally {
    flushing = false
  }
}

function tick() {
  pullFromServer().catch(() => {})
  flushQueue().catch(() => {})
}

let started = false

export function startSyncEngine() {
  if (started) return
  started = true

  window.addEventListener('online', tick)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') tick()
  })
  setInterval(tick, 30_000)

  tick()
}

export async function enqueueAndFlush(mutation: Omit<QueuedMutation, 'localId' | 'status' | 'attempts'>) {
  await db.mutationQueue.add({ ...mutation, status: 'pending', attempts: 0 })
  if (navigator.onLine) flushQueue().catch(() => {})
}
