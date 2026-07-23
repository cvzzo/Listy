import type { Handler } from '@netlify/functions'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { items } from '../../db/schema'
import { json, HttpError } from './_shared/response'
import { verifySession } from './_shared/auth'
import { applyMutation } from './_shared/mutations'

export const handler: Handler = async (event) => {
  try {
    const session = await verifySession(event)
    const db = getDb()

    if (event.httpMethod === 'GET') {
      const listId = event.queryStringParameters?.listId
      if (!listId) throw new HttpError(400, 'listId is required')

      const rows = await db
        .select()
        .from(items)
        .where(
          and(
            eq(items.familyId, session.familyId),
            eq(items.listId, listId),
            isNull(items.deletedAt),
          ),
        )
        .orderBy(asc(items.position))
      return json(200, rows)
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body ?? '{}')
      const row = await applyMutation(session, {
        id: crypto.randomUUID(),
        entity: 'item',
        op: 'create',
        payload: body,
      })
      return json(201, row)
    }

    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body ?? '{}')
      const { id, deletedAt, ...changes } = body
      if (!id) throw new HttpError(400, 'id is required')

      const row = await applyMutation(session, {
        id,
        entity: 'item',
        op: deletedAt ? 'delete' : 'update',
        payload: changes,
      })
      if (!row) throw new HttpError(404, 'item not found')
      return json(200, row)
    }

    throw new HttpError(405, 'method not allowed')
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
