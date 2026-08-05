import { db, type QueuedMutation } from '../db/db'
import { apiFetch } from '../api/client'
import {
  getActiveFamilyId,
  getSession,
  getSessionFor,
  getSessions,
  type Session,
} from '../auth/session'
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

// Ogni famiglia ha il suo avanzamento: sono database diversi sul server, e un
// unico segnalibro farebbe saltare le modifiche dell'una passando all'altra
const lastSyncedAtKey = (familyId: string) => `lastSyncedAt:${familyId}`
/** Il segnalibro unico di quando la famiglia era una sola. */
const LEGACY_LAST_SYNCED_AT_KEY = 'lastSyncedAt'

async function getLastSyncedAt(familyId: string): Promise<string> {
  const row = await db.meta.get(lastSyncedAtKey(familyId))
  return (row?.value as string) ?? '0'
}

let legacyCursorMigration: Promise<void> | undefined

/**
 * Il segnalibro unico di quando la famiglia era una sola passa alla famiglia con
 * cui si stava lavorando, e sparisce. Deve valere solo per lei: ereditato da una
 * famiglia appena raggiunta, farebbe saltare per sempre tutto cio che sul server
 * e piu vecchio di quella data.
 */
function migrateLegacySyncCursor(): Promise<void> {
  legacyCursorMigration ??= (async () => {
    const legacy = await db.meta.get(LEGACY_LAST_SYNCED_AT_KEY)
    if (!legacy) return

    const familyId = getActiveFamilyId()
    if (familyId && !(await db.meta.get(lastSyncedAtKey(familyId)))) {
      await db.meta.put({ key: lastSyncedAtKey(familyId), value: legacy.value })
    }
    await db.meta.delete(LEGACY_LAST_SYNCED_AT_KEY)
  })()
  return legacyCursorMigration
}

async function setLastSyncedAt(familyId: string, value: string) {
  await db.meta.put({ key: lastSyncedAtKey(familyId), value })
}

export async function pullFromServer(session: Session | null = getSession()) {
  if (!session) return
  // Offline la richiesta non arriverebbe alla rete ma al service worker, che
  // risponderebbe con una copia in cache: righe vecchie che sovrascriverebbero
  // le modifiche appena fatte a mano
  if (!navigator.onLine) return

  await migrateLegacySyncCursor()

  const familyId = session.family.id
  const since = await getLastSyncedAt(familyId)
  const res = await apiFetch<SyncPullResponse>(
    `/sync-pull?since=${encodeURIComponent(since)}`,
    {},
    session,
  )

  await db.transaction('rw', [db.lists, db.categories, db.items], async () => {
    // Riga per riga e non bulkPut: una modifica locale non ancora inviata e piu
    // recente di quella del server, e non va persa mentre aspetta il suo turno
    for (const row of res.lists) await reconcileIntoDexie(db.lists, row)
    for (const row of res.categories) await reconcileIntoDexie(db.categories, row)
    for (const row of res.items) await reconcileIntoDexie(db.items, row)
  })

  await setLastSyncedAt(familyId, res.syncedAt)
}

let flushing = false

export async function flushQueue() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    const queued = await db.mutationQueue
      .where('status')
      .anyOf(['pending', 'failed'])
      .sortBy('localId')
    if (queued.length === 0) return

    // Ogni famiglia ha il suo token, quindi il suo lotto: mandare tutto insieme
    // significherebbe firmare le mutazioni dell'una con le credenziali dell'altra
    const byFamily = new Map<string, QueuedMutation[]>()
    for (const mutation of queued) {
      const list = byFamily.get(mutation.familyId)
      if (list) list.push(mutation)
      else byFamily.set(mutation.familyId, [mutation])
    }

    for (const [familyId, mutations] of byFamily) {
      const session = getSessionFor(familyId)
      if (!session) {
        // Famiglia lasciata mentre la coda era piena: non c'e piu nessuno per cui
        // mandarle, e tenerle vorrebbe dire riprovarle per sempre
        await db.mutationQueue.bulkDelete(mutations.map((m) => m.localId!))
        continue
      }
      await flushForFamily(session, mutations)
    }
  } finally {
    flushing = false
  }
}

async function flushForFamily(session: Session, pending: QueuedMutation[]) {
  await db.mutationQueue.bulkPut(pending.map((m) => ({ ...m, status: 'sending' })))

  try {
    const res = await apiFetch<{ results: SyncPushResult[] }>(
      '/sync-push',
      {
        method: 'POST',
        body: JSON.stringify({
          mutations: pending.map((m) => ({
            id: m.id,
            entity: m.entity,
            op: m.op,
            payload: m.payload,
          })),
        }),
      },
      session,
    )

    // La correlazione è posizionale: sync-push produce un result per ogni mutazione
    // ricevuta, nello stesso ordine. Cercare per (id, entity) non basta, perché un
    // batch può contenere più mutazioni sullo stesso record (es. svuota lista + annulla)
    // e la prima verrebbe rimossa due volte lasciando le altre bloccate in "sending".
    for (const [index, result] of res.results.entries()) {
      const mutation = pending[index]
      if (mutation?.localId === undefined) continue
      if (mutation.id !== result.id || mutation.entity !== result.entity) continue

      if (result.status === 'ok' && result.row) {
        // reconcileIntoDexie (non un put diretto) evita che la risposta di un flush precedente
        // sovrascriva una modifica locale più recente fatta mentre la richiesta era in volo
        // (es. spuntare un articolo offline subito dopo averlo creato online).
        if (result.entity === 'list') await reconcileIntoDexie(db.lists, result.row as List)
        if (result.entity === 'category')
          await reconcileIntoDexie(db.categories, result.row as Category)
        if (result.entity === 'item') await reconcileIntoDexie(db.items, result.row as Item)
        await db.mutationQueue.delete(mutation.localId)
      } else {
        await db.mutationQueue.update(mutation.localId, {
          status: 'failed',
          attempts: mutation.attempts + 1,
        })
      }
    }
  } catch {
    const stuck = await db.mutationQueue.where('status').equals('sending').toArray()
    await db.mutationQueue.bulkPut(stuck.map((m) => ({ ...m, status: 'pending' })))
  }
}

function tick() {
  // Si scarica solo la famiglia aperta: le altre le si sincronizza entrandoci.
  // Le mutazioni in coda invece partono tutte, da qualunque famiglia vengano.
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

/** Sincronizza subito una famiglia appena scelta, senza aspettare il giro dei 30s. */
export function syncFamily(familyId: string) {
  const session = getSessionFor(familyId)
  if (!session) return
  pullFromServer(session).catch(() => {})
}

/** Tutte le famiglie del dispositivo, per riempire la pagina che le elenca. */
export function pullAllFamilies() {
  for (const session of getSessions()) {
    pullFromServer(session).catch(() => {})
  }
}

type NewMutation = Omit<QueuedMutation, 'localId' | 'status' | 'attempts' | 'familyId'>

export async function enqueueAndFlush(mutation: NewMutation) {
  await enqueueManyAndFlush([mutation])
}

// Le azioni di massa producono una mutazione per articolo: accodarle insieme evita
// sia una scrittura Dexie per volta sia un flush per volta.
export async function enqueueManyAndFlush(mutations: NewMutation[]) {
  if (mutations.length === 0) return
  // Si accoda sempre per la famiglia aperta: e da li che arrivano le azioni
  const session = getSession()
  if (!session) return

  await db.mutationQueue.bulkAdd(
    mutations.map((m) => ({
      ...m,
      familyId: session.family.id,
      status: 'pending' as const,
      attempts: 0,
    })),
  )
  if (navigator.onLine) flushQueue().catch(() => {})
}
