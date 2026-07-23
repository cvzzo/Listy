import Dexie, { type Table } from 'dexie'
import type { Category, Item, List } from '../types'

export type QueuedMutation = {
  localId?: number
  id: string
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
