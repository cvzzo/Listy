import type { Handler } from '@netlify/functions'
import { json, HttpError } from './_shared/response'
import { verifySession } from './_shared/auth'
import { createFamilyTokenRequest } from './_shared/ably'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'method not allowed')

    const session = await verifySession(event)
    const tokenRequest = await createFamilyTokenRequest(session.familyId, session.memberId)

    return json(200, tokenRequest)
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
