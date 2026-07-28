import webpush from 'web-push'
import { eq, inArray } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { pushSubscriptions } from '../../../db/schema'

let configured = false

function configure() {
  if (configured) return
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!publicKey || !privateKey) throw new Error('VAPID keys are not set')

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:noreply@listy.app',
    publicKey,
    privateKey,
  )
  configured = true
}

export type PushPayload = {
  title: string
  body: string
  url: string
}

/**
 * Manda la notifica a tutti i dispositivi di una famiglia e ripulisce quelli
 * che il servizio push dichiara morti: una sottoscrizione scaduta o revocata
 * risponde 404 o 410, e riprovarci a ogni giro e solo tempo perso.
 */
export async function sendToFamily(familyId: string, payload: PushPayload) {
  configure()
  const db = getDb()

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.familyId, familyId))

  if (subscriptions.length === 0) return { sent: 0, removed: 0 }

  const body = JSON.stringify(payload)
  const stale: string[] = []
  let sent = 0

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        )
        sent += 1
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 404 || statusCode === 410) stale.push(sub.id)
        else console.error('push failed', sub.endpoint, statusCode)
      }
    }),
  )

  if (stale.length > 0) {
    await db.delete(pushSubscriptions).where(inArray(pushSubscriptions.id, stale))
  }

  return { sent, removed: stale.length }
}
