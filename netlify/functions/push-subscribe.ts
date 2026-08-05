import type { Handler } from '@netlify/functions'
import { and, eq } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { pushSubscriptions } from '../../db/schema'
import { json, HttpError } from './_shared/response'
import { verifySession } from './_shared/auth'

export const handler: Handler = async (event) => {
  try {
    const session = await verifySession(event)
    const db = getDb()
    const body = JSON.parse(event.body ?? '{}')
    const endpoint = String(body.endpoint ?? '')
    if (!endpoint) throw new HttpError(400, 'endpoint is required')

    if (event.httpMethod === 'DELETE') {
      // Solo l'iscrizione di questo dispositivo per questa famiglia: chi spegne le
      // notifiche lo fa una famiglia per volta, e nessuno puo togliere quelle altrui
      await db
        .delete(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.endpoint, endpoint),
            eq(pushSubscriptions.familyId, session.familyId),
          ),
        )
      return json(200, { ok: true })
    }

    if (event.httpMethod !== 'POST') throw new HttpError(405, 'method not allowed')

    const p256dh = String(body.keys?.p256dh ?? '')
    const auth = String(body.keys?.auth ?? '')
    if (!p256dh || !auth) throw new HttpError(400, 'keys are required')

    // Una riga per dispositivo e famiglia. Riscrivere la stessa coppia significa
    // che il membro e cambiato o che le chiavi sono state rigenerate: si aggiorna,
    // non si duplica. Le iscrizioni alle altre famiglie restano dove sono.
    await db
      .insert(pushSubscriptions)
      .values({
        id: crypto.randomUUID(),
        familyId: session.familyId,
        memberId: session.memberId,
        endpoint,
        p256dh,
        auth,
      })
      .onConflictDoUpdate({
        target: [pushSubscriptions.endpoint, pushSubscriptions.familyId],
        set: { memberId: session.memberId, p256dh, auth },
      })

    return json(201, { ok: true })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
