import type { Config } from '@netlify/functions'
import { and, eq, gte, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { lists } from '../../db/schema'
import { sendToFamily } from './_shared/push'

// Quanto indietro guardare. Senza questo limite, la prima esecuzione dopo il
// rilascio annuncerebbe tutte le spese gia passate della storia della famiglia.
const LOOKBACK_MS = 60 * 60 * 1000

export default async () => {
  const db = getDb()
  const now = new Date()
  const from = new Date(now.getTime() - LOOKBACK_MS)

  const due = await db
    .select()
    .from(lists)
    .where(
      and(
        isNull(lists.deletedAt),
        isNotNull(lists.shoppingAt),
        gte(lists.shoppingAt, from),
        lte(lists.shoppingAt, now),
        // Mai notificata, oppure notificata per un orario diverso da quello
        // attuale: spostare la spesa deve far ripartire l'avviso
        or(isNull(lists.notifiedFor), ne(lists.notifiedFor, sql`${lists.shoppingAt}`)),
      ),
    )

  let notified = 0
  for (const list of due) {
    // Marcata prima dell'invio: se il push fallisce a meta preferiamo perdere
    // l'avviso piuttosto che rimandarlo a ripetizione ogni cinque minuti
    await db
      .update(lists)
      .set({ notifiedFor: list.shoppingAt })
      .where(eq(lists.id, list.id))

    const result = await sendToFamily(list.familyId, {
      title: 'E ora di fare la spesa',
      body: list.name,
      url: `/liste/${list.id}`,
    })
    notified += result.sent
  }

  console.log(`notify-shopping: ${due.length} liste in scadenza, ${notified} notifiche inviate`)
  return new Response(null, { status: 204 })
}

export const config: Config = {
  // Ogni cinque minuti: l'avviso puo arrivare con quel ritardo, per la spesa va bene
  schedule: '*/5 * * * *',
}
