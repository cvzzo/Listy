import { and, eq, max } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { categories, items, lists } from '../../../db/schema'
import type { SessionPayload } from './auth'
import { publishMutation } from './ably'
import { formatWhen, sendToFamily } from './push'
import { HttpError } from './response'

export type MutationEntity = 'list' | 'category' | 'item'
export type MutationOp = 'create' | 'update' | 'delete'

export type MutationInput = {
  id: string
  entity: MutationEntity
  op: MutationOp
  payload: Record<string, unknown>
}

export async function applyMutation(session: SessionPayload, m: MutationInput) {
  if (m.entity === 'list') return applyListMutation(session, m)
  if (m.entity === 'category') return applyCategoryMutation(session, m)
  return applyItemMutation(session, m)
}

async function applyListMutation(session: SessionPayload, m: MutationInput) {
  const db = getDb()

  if (m.op === 'delete') {
    const [row] = await db
      .update(lists)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(lists.id, m.id), eq(lists.familyId, session.familyId)))
      .returning()
    if (row) await publishMutation(session, 'list', row)
    return row ?? null
  }

  if (m.op === 'create') {
    const name = String(m.payload.name ?? '').trim()
    if (!name) throw new HttpError(400, 'name is required')

    const [{ maxPosition }] = await db
      .select({ maxPosition: max(lists.position) })
      .from(lists)
      .where(eq(lists.familyId, session.familyId))

    const [row] = await db
      .insert(lists)
      .values({
        id: m.id,
        familyId: session.familyId,
        name,
        createdBy: session.memberId,
        position: (maxPosition ?? 0) + 1000,
      })
      // Rigiocare una create deve riportare in vita la riga e muovere updatedAt,
      // altrimenti un "rifai" dopo un "annulla" non si propaga agli altri dispositivi
      .onConflictDoUpdate({
        target: lists.id,
        set: { name, deletedAt: null, updatedAt: new Date() },
      })
      .returning()

    await publishMutation(session, 'list', row)
    return row
  }

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof m.payload.name === 'string') changes.name = m.payload.name
  if (typeof m.payload.position === 'number') changes.position = m.payload.position
  if (m.payload.deletedAt === null) changes.deletedAt = null

  // La chiave presente con valore nullo significa "togli la data", non "non toccarla"
  const changingDate = 'shoppingAt' in m.payload
  if (changingDate) {
    changes.shoppingAt = m.payload.shoppingAt ? new Date(String(m.payload.shoppingAt)) : null
  }

  // Serve il valore precedente per capire se la data e cambiata davvero: salvare
  // due volte lo stesso orario non deve annunciare niente a nessuno
  const previous = changingDate
    ? (
        await db
          .select({ shoppingAt: lists.shoppingAt })
          .from(lists)
          .where(and(eq(lists.id, m.id), eq(lists.familyId, session.familyId)))
      )[0]
    : undefined

  const [row] = await db
    .update(lists)
    .set(changes)
    .where(and(eq(lists.id, m.id), eq(lists.familyId, session.familyId)))
    .returning()
  if (!row) return null

  await publishMutation(session, 'list', row)

  if (changingDate && row.shoppingAt && +row.shoppingAt !== +(previous?.shoppingAt ?? 0)) {
    await announceShoppingDate(session, row.id, row.name, row.shoppingAt)
  }

  return row
}

/** Avvisa la famiglia che qualcuno ha fissato la spesa. Chi l'ha fissata lo sa gia. */
async function announceShoppingDate(
  session: SessionPayload,
  listId: string,
  listName: string,
  shoppingAt: Date,
) {
  try {
    await sendToFamily(
      session.familyId,
      {
        title: `${session.displayName} ha fissato la spesa`,
        body: `${listName} — ${formatWhen(shoppingAt)}`,
        url: `/liste/${listId}`,
        tag: `lista-${listId}-fissata`,
      },
      session.memberId,
    )
  } catch (err) {
    // Le notifiche sono un di piu: se non partono, la data resta comunque salvata
    console.error('push "spesa fissata" fallito', err)
  }
}

async function applyCategoryMutation(session: SessionPayload, m: MutationInput) {
  const db = getDb()

  if (m.op === 'delete') {
    const [row] = await db
      .update(categories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(categories.id, m.id), eq(categories.familyId, session.familyId)))
      .returning()
    if (row) await publishMutation(session, 'category', row)
    return row ?? null
  }

  if (m.op === 'create') {
    const listId = String(m.payload.listId ?? '')
    const name = String(m.payload.name ?? '').trim()
    if (!listId || !name) throw new HttpError(400, 'listId and name are required')

    const [{ maxPosition }] = await db
      .select({ maxPosition: max(categories.position) })
      .from(categories)
      .where(eq(categories.listId, listId))

    const [row] = await db
      .insert(categories)
      .values({
        id: m.id,
        familyId: session.familyId,
        listId,
        name,
        position: (maxPosition ?? 0) + 1000,
      })
      .onConflictDoUpdate({
        target: categories.id,
        set: { name, deletedAt: null, updatedAt: new Date() },
      })
      .returning()

    await publishMutation(session, 'category', row)
    return row
  }

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  if (typeof m.payload.name === 'string') changes.name = m.payload.name
  if (typeof m.payload.position === 'number') changes.position = m.payload.position
  if (m.payload.deletedAt === null) changes.deletedAt = null

  const [row] = await db
    .update(categories)
    .set(changes)
    .where(and(eq(categories.id, m.id), eq(categories.familyId, session.familyId)))
    .returning()
  if (row) await publishMutation(session, 'category', row)
  return row ?? null
}

async function applyItemMutation(session: SessionPayload, m: MutationInput) {
  const db = getDb()

  if (m.op === 'delete') {
    const [row] = await db
      .update(items)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(items.id, m.id), eq(items.familyId, session.familyId)))
      .returning()
    if (row) await publishMutation(session, 'item', row)
    return row ?? null
  }

  if (m.op === 'create') {
    const listId = String(m.payload.listId ?? '')
    const name = String(m.payload.name ?? '').trim()
    const categoryId = m.payload.categoryId ? String(m.payload.categoryId) : null
    const quantity = m.payload.quantity ? String(m.payload.quantity) : null
    if (!listId || !name) throw new HttpError(400, 'listId and name are required')

    const [{ maxPosition }] = await db
      .select({ maxPosition: max(items.position) })
      .from(items)
      .where(eq(items.listId, listId))

    const [row] = await db
      .insert(items)
      .values({
        id: m.id,
        familyId: session.familyId,
        listId,
        categoryId,
        name,
        quantity,
        addedBy: session.memberId,
        addedByName: session.displayName,
        position: (maxPosition ?? 0) + 1000,
      })
      .onConflictDoUpdate({
        target: items.id,
        set: { name, categoryId, quantity, deletedAt: null, updatedAt: new Date() },
      })
      .returning()

    await publishMutation(session, 'item', row)
    return row
  }

  const changes: Record<string, unknown> = { updatedAt: new Date() }
  const p = m.payload
  if (typeof p.name === 'string') changes.name = p.name
  if ('quantity' in p) changes.quantity = p.quantity ? String(p.quantity) : null
  if ('categoryId' in p) changes.categoryId = p.categoryId ? String(p.categoryId) : null
  if (typeof p.position === 'number') changes.position = p.position
  if (p.deletedAt === null) changes.deletedAt = null
  if (typeof p.checked === 'boolean') {
    changes.checked = p.checked
    if (p.checked) {
      changes.checkedBy = session.memberId
      changes.checkedByName = session.displayName
      changes.checkedAt = new Date()
    } else {
      changes.checkedBy = null
      changes.checkedByName = null
      changes.checkedAt = null
    }
  }

  const [row] = await db
    .update(items)
    .set(changes)
    .where(and(eq(items.id, m.id), eq(items.familyId, session.familyId)))
    .returning()
  if (row) await publishMutation(session, 'item', row)
  return row ?? null
}
