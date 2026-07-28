import type { Config } from '@netlify/functions'
import { and, eq, gte, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { lists } from '../../db/schema'
import { formatWhen, sendToFamily } from './_shared/push'


/**
 * Ogni avviso ha un istante in cui scatta, e si manda solo se quell'istante e
 * appena passato. Senza questa finestra, il primo giro dopo un rilascio
 * annuncerebbe tutte le spese vecchie, e una data fissata all'ultimo momento
 * farebbe partire il promemoria del giorno prima subito dopo quello di conferma.
 */
const WINDOW_MS = 60 * 60 * 1000

export default async () => {
  const db = getDb()
  const now = new Date()
  const windowStart = new Date(now.getTime() - WINDOW_MS)

  // Il giorno prima: scatta 24 ore prima della spesa
  const dayBefore = await db
    .select()
    .from(lists)
    .where(
      and(
        isNull(lists.deletedAt),
        isNotNull(lists.shoppingAt),
        gte(sql`${lists.shoppingAt} - interval '24 hours'`, windowStart),
        lte(sql`${lists.shoppingAt} - interval '24 hours'`, now),
        or(
          isNull(lists.notifiedDayBeforeFor),
          ne(lists.notifiedDayBeforeFor, sql`${lists.shoppingAt}`),
        ),
      ),
    )

  // All'ora della spesa
  const due = await db
    .select()
    .from(lists)
    .where(
      and(
        isNull(lists.deletedAt),
        isNotNull(lists.shoppingAt),
        gte(lists.shoppingAt, windowStart),
        lte(lists.shoppingAt, now),
        or(isNull(lists.notifiedDueFor), ne(lists.notifiedDueFor, sql`${lists.shoppingAt}`)),
      ),
    )

  let sent = 0

  for (const list of dayBefore) {
    // Marcata prima dell'invio: se il push fallisce a meta preferiamo perdere
    // l'avviso piuttosto che rimandarlo a ripetizione ogni cinque minuti
    await db
      .update(lists)
      .set({ notifiedDayBeforeFor: list.shoppingAt })
      .where(eq(lists.id, list.id))

    const result = await sendToFamily(list.familyId, {
      title: 'Domani si fa la spesa',
      body: `${list.name} — ${formatWhen(list.shoppingAt!)}`,
      url: `/liste/${list.id}`,
      tag: `lista-${list.id}-domani`,
    })
    sent += result.sent
  }

  for (const list of due) {
    await db.update(lists).set({ notifiedDueFor: list.shoppingAt }).where(eq(lists.id, list.id))

    const result = await sendToFamily(list.familyId, {
      title: 'E ora di fare la spesa',
      body: list.name,
      url: `/liste/${list.id}`,
      tag: `lista-${list.id}-ora`,
      // Questa e la sola che conviene resti a schermo: e il momento in cui serve
      keepOpen: true,
    })
    sent += result.sent
  }

  console.log(
    `notify-shopping: ${dayBefore.length} il giorno prima, ${due.length} in scadenza, ${sent} notifiche inviate`,
  )
  return new Response(null, { status: 204 })
}

export const config: Config = {
  // Ogni cinque minuti: l'avviso puo arrivare con quel ritardo, per la spesa va bene
  schedule: '*/5 * * * *',
}

