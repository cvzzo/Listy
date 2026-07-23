import type { Handler } from '@netlify/functions'
import { and, eq, gt } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { categories, items, lists } from '../../db/schema'
import { json, HttpError } from './_shared/response'
import { verifySession } from './_shared/auth'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'method not allowed')

    const session = await verifySession(event)
    const db = getDb()

    const sinceParam = event.queryStringParameters?.since
    const since = sinceParam && sinceParam !== '0' ? new Date(sinceParam) : new Date(0)

    const [listRows, categoryRows, itemRows] = await Promise.all([
      db
        .select()
        .from(lists)
        .where(and(eq(lists.familyId, session.familyId), gt(lists.updatedAt, since))),
      db
        .select()
        .from(categories)
        .where(and(eq(categories.familyId, session.familyId), gt(categories.updatedAt, since))),
      db
        .select()
        .from(items)
        .where(and(eq(items.familyId, session.familyId), gt(items.updatedAt, since))),
    ])

    return json(200, {
      lists: listRows,
      categories: categoryRows,
      items: itemRows,
      syncedAt: new Date().toISOString(),
    })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
