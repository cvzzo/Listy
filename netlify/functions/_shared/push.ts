import webpush from 'web-push'
import { and, eq, inArray, ne } from 'drizzle-orm'
import { getDb } from '../../../db/client'
import { pushSubscriptions } from '../../../db/schema'

/**
 * Il server gira in UTC ma la famiglia no: senza fuso esplicito una spesa delle
 * 10:30 verrebbe annunciata come le 08:30. Finche l'app e per una famiglia
 * italiana questa e la scelta piu semplice che dia l'ora giusta.
 */
const FAMILY_TIME_ZONE = 'Europe/Rome'

const dayFormat = new Intl.DateTimeFormat('it-IT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: FAMILY_TIME_ZONE,
})
const timeFormat = new Intl.DateTimeFormat('it-IT', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: FAMILY_TIME_ZONE,
})

export function formatWhen(date: Date): string {
  return `${dayFormat.format(date)} alle ${timeFormat.format(date)}`
}

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
  /**
   * Notifiche con lo stesso tag si sostituiscono a vicenda. I tre avvisi di una
   * spesa sono eventi distinti e devono avere tag diversi, altrimenti il secondo
   * cancella il primo e Android tende a trattarlo come un aggiornamento silenzioso
   * invece che come una notizia nuova.
   */
  tag?: string
  /** Resta a schermo finche non la si tocca: si usa per l'avviso dell'ultimo momento */
  keepOpen?: boolean
}

/**
 * Manda la notifica a tutti i dispositivi di una famiglia e ripulisce quelli
 * che il servizio push dichiara morti: una sottoscrizione scaduta o revocata
 * risponde 404 o 410, e riprovarci a ogni giro e solo tempo perso.
 */
export async function sendToFamily(
  familyId: string,
  payload: PushPayload,
  // Chi ha appena fatto l'azione non va avvisato di cio che ha fatto lui
  exceptMemberId?: string,
) {
  configure()
  const db = getDb()

  const subscriptions = await db
    .select()
    .from(pushSubscriptions)
    .where(
      exceptMemberId
        ? and(
            eq(pushSubscriptions.familyId, familyId),
            ne(pushSubscriptions.memberId, exceptMemberId),
          )
        : eq(pushSubscriptions.familyId, familyId),
    )

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
          {
            // Senza urgency alta il servizio push puo accodare la consegna quando il
            // telefono e in risparmio energetico, ed e proprio allora che serve
            urgency: 'high',
            // Scaduto questo tempo la notizia non serve piu: meglio perderla che
            // vedersela arrivare il giorno dopo
            TTL: 6 * 60 * 60,
          },
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
