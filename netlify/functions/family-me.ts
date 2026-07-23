import type { Handler } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { families, members } from '../../db/schema'
import { json, HttpError } from './_shared/response'
import { verifySession } from './_shared/auth'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'method not allowed')

    const session = await verifySession(event)
    const db = getDb()

    const [family] = await db.select().from(families).where(eq(families.id, session.familyId))
    if (!family) throw new HttpError(404, 'family_not_found')

    const familyMembers = await db
      .select()
      .from(members)
      .where(eq(members.familyId, session.familyId))

    return json(200, { family, member: session, members: familyMembers })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
