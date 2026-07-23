import type { Handler } from '@netlify/functions'
import { json, HttpError } from './_shared/response'
import { verifySession } from './_shared/auth'
import { applyMutation, type MutationInput } from './_shared/mutations'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'method not allowed')

    const session = await verifySession(event)
    const body = JSON.parse(event.body ?? '{}')
    const mutations: MutationInput[] = Array.isArray(body.mutations) ? body.mutations : []

    const results = []
    for (const m of mutations) {
      try {
        const row = await applyMutation(session, m)
        results.push({ id: m.id, entity: m.entity, status: 'ok' as const, row })
      } catch (err) {
        results.push({
          id: m.id,
          entity: m.entity,
          status: 'error' as const,
          error: err instanceof HttpError ? err.message : 'internal_error',
        })
      }
    }

    return json(200, { results })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
