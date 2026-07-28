import type { Handler } from '@netlify/functions'
import { json, HttpError } from './_shared/response'

/**
 * La chiave pubblica VAPID serve al browser per sottoscriversi. Passa da qui invece
 * che da una variabile di build, cosi ruotarla non richiede di ricostruire il sito.
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') throw new HttpError(405, 'method not allowed')

    const publicKey = process.env.VAPID_PUBLIC_KEY
    if (!publicKey) throw new HttpError(503, 'push_not_configured')

    return json(200, { publicKey })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
