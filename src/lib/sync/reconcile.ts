import type { Table } from 'dexie'

type Reconcilable = { id: string; updatedAt: string }

export async function reconcileIntoDexie<T extends Reconcilable>(
  table: Table<T, string>,
  incoming: T,
) {
  const local = await table.get(incoming.id)
  if (local && new Date(incoming.updatedAt) <= new Date(local.updatedAt)) return
  await table.put(incoming)
}
