import { db } from '../db/db'
import { enqueueManyAndFlush } from '../sync/engine'
import type { Category, Item, List } from '../types'

export type Entity = 'list' | 'category' | 'item'

/**
 * Una modifica descritta come dato, non come funzione: e questo che rende la
 * cronologia percorribile nei due sensi. Ogni azione dell'utente diventa un elenco
 * di Change in avanti e l'elenco speculare all'indietro.
 *
 * Ogni Change porta due cose: cosa scrivere in Dexie (`local`, che vede subito chi
 * sta usando l'app) e cosa mandare al server (`payload`, che il motore di
 * sincronizzazione accoda).
 */
export type Change =
  | {
      kind: 'create'
      entity: Entity
      id: string
      row: List | Category | Item
      payload: Record<string, unknown>
    }
  | {
      kind: 'update'
      entity: Entity
      id: string
      op: 'update' | 'delete'
      local: Record<string, unknown>
      payload: Record<string, unknown>
    }

async function writeLocally(change: Change, now: string) {
  if (change.kind === 'create') {
    // put, non add: rifare una creazione dopo averla annullata riscrive la riga
    // che nel frattempo era stata solo marcata come eliminata
    const row = { ...change.row, deletedAt: null, updatedAt: now }
    if (change.entity === 'list') await db.lists.put(row as List)
    else if (change.entity === 'category') await db.categories.put(row as Category)
    else await db.items.put(row as Item)
    return
  }

  // I campi arrivano da chi costruisce la Change ed e sempre un sottoinsieme della
  // riga: Dexie vuole una UpdateSpec tipizzata, qui la forma la garantiamo noi
  const patch = { ...change.local, updatedAt: now } as never
  if (change.entity === 'list') await db.lists.update(change.id, patch)
  else if (change.entity === 'category') await db.categories.update(change.id, patch)
  else await db.items.update(change.id, patch)
}

export async function applyChanges(changes: Change[]) {
  if (changes.length === 0) return
  const now = new Date().toISOString()

  for (const change of changes) {
    await writeLocally(change, now)
  }

  await enqueueManyAndFlush(
    changes.map((change) => ({
      id: change.id,
      entity: change.entity,
      op: change.kind === 'create' ? ('create' as const) : change.op,
      payload: change.payload,
      clientTimestamp: now,
    })),
  )
}

/** Scorciatoia per la coppia piu ricorrente: eliminare e riportare in vita. */
export function softDeleteChange(entity: Entity, id: string): Change {
  return {
    kind: 'update',
    entity,
    id,
    op: 'delete',
    local: { deletedAt: new Date().toISOString() },
    payload: {},
  }
}

export function restoreChange(entity: Entity, id: string): Change {
  return {
    kind: 'update',
    entity,
    id,
    op: 'update',
    local: { deletedAt: null },
    payload: { deletedAt: null },
  }
}
