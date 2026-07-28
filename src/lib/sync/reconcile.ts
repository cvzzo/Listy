import type { Table } from 'dexie'

type Reconcilable = { id: string; updatedAt: string }

/**
 * Scrive la riga in arrivo solo se e piu recente di quella locale.
 * Ritorna se ha davvero scritto: chi annuncia la modifica deve tacere quando
 * l'aggiornamento e stato scartato perche vecchio.
 */
export async function reconcileIntoDexie<T extends Reconcilable>(
  table: Table<T, string>,
  incoming: T,
): Promise<boolean> {
  const local = await table.get(incoming.id)
  if (local && new Date(incoming.updatedAt) <= new Date(local.updatedAt)) return false

  await table.put(incoming)
  return true
}
