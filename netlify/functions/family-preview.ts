import type { Handler } from '@netlify/functions'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { families } from '../../db/schema'
import { json, HttpError } from './_shared/response'

/**
 * Chi apre un link d'invito non ha ancora una sessione, e prima di dare il proprio
 * nome vuole sapere dove sta entrando. Risponde con il minimo per dirlo: nome e id
 * della famiglia, niente membri, niente liste.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'method not allowed')

    const code = (event.queryStringParameters?.code ?? '').trim().toUpperCase()
    if (!code) throw new HttpError(400, 'code is required')

    const db = getDb()
    const [family] = await db
      .select({ id: families.id, name: families.name })
      .from(families)
      .where(eq(families.inviteCode, code))
    if (!family) throw new HttpError(404, 'family_not_found')

    return json(200, { family })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
