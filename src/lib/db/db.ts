import Dexie, { type Table } from 'dexie'
import { getActiveFamilyId } from '../auth/session'
import type { Category, Item, List } from '../types'

export type QueuedMutation = {
  localId?: number
  id: string
  /**
   * A quale famiglia appartiene la mutazione. Serve a mandarla con il token
   * giusto: il dispositivo puo stare in piu famiglie e chi svuota la coda non e
   * detto sia la famiglia aperta in quel momento.
   */
  familyId: string
  entity: 'list' | 'category' | 'item'
  op: 'create' | 'update' | 'delete'
  payload: Record<string, unknown>
  clientTimestamp: string
  status: 'pending' | 'sending' | 'failed'
  attempts: number
}

class AppDB extends Dexie {
  lists!: Table<List, string>
  categories!: Table<Category, string>
  items!: Table<Item, string>
  mutationQueue!: Table<QueuedMutation, number>
  meta!: Table<{ key: string; value: unknown }, string>

  constructor() {
    super('listy')
    this.version(1).stores({
      lists: 'id, familyId, updatedAt, deletedAt',
      categories: 'id, listId, familyId, updatedAt, deletedAt',
      items: 'id, listId, categoryId, familyId, updatedAt, deletedAt, checked',
      mutationQueue: '++localId, status',
      meta: 'key',
    })
    this.version(2)
      .stores({
        lists: 'id, familyId, updatedAt, deletedAt',
        categories: 'id, listId, familyId, updatedAt, deletedAt',
        items: 'id, listId, categoryId, familyId, updatedAt, deletedAt, checked',
        mutationQueue: '++localId, status, familyId',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        // Le mutazioni rimaste in coda vengono da quando la famiglia era una sola:
        // sono per forza di quella con cui l'utente stava lavorando
        const familyId = getActiveFamilyId()
        if (!familyId) return
        await tx
          .table<QueuedMutation>('mutationQueue')
          .toCollection()
          .modify((m) => {
            m.familyId = familyId
          })
      })
  }
}

export const db = new AppDB()

export async function clearLocalData() {
  await db.transaction(
    'rw',
    [db.lists, db.categories, db.items, db.mutationQueue, db.meta],
    async () => {
      await Promise.all([
        db.lists.clear(),
        db.categories.clear(),
        db.items.clear(),
        db.mutationQueue.clear(),
        db.meta.clear(),
      ])
    },
  )
}

/**
 * Cancella in locale tutto cio che riguarda una famiglia, lasciando intatte le
 * altre: e cosi che si esce da una famiglia sola senza svuotare il dispositivo.
 */
export async function clearFamilyData(familyId: string) {
  await db.transaction(
    'rw',
    [db.lists, db.categories, db.items, db.mutationQueue, db.meta],
    async () => {
      await Promise.all([
        db.lists.where('familyId').equals(familyId).delete(),
        db.categories.where('familyId').equals(familyId).delete(),
        db.items.where('familyId').equals(familyId).delete(),
        db.mutationQueue.where('familyId').equals(familyId).delete(),
        db.meta.delete(`lastSyncedAt:${familyId}`),
      ])
    },
  )
}
