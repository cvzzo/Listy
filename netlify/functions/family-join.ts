import type { Handler } from '@netlify/functions'
import { and, eq, sql } from 'drizzle-orm'
import { getDb } from '../../db/client'
import { families, members } from '../../db/schema'
import { json, HttpError } from './_shared/response'
import { signSession } from './_shared/auth'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'method not allowed')

    const body = JSON.parse(event.body ?? '{}')
    const inviteCode = String(body.inviteCode ?? '').trim().toUpperCase()
    const displayName = String(body.displayName ?? '').trim()
    /**
     * "Quel nome e mio": lo dice chi rientra da un altro dispositivo, dopo che gli
     * e stato chiesto. Senza, un nome gia in uso non viene preso di soppiatto ma
     * fermato, perche chi invita puo mandare il link a chiunque e nessuno deve
     * ritrovarsi nei panni di un altro per aver scritto lo stesso nome.
     */
    const claimExisting = body.claimExisting === true
    if (!inviteCode || !displayName) {
      throw new HttpError(400, 'inviteCode and displayName are required')
    }

    const db = getDb()

    const [family] = await db
      .select()
      .from(families)
      .where(eq(families.inviteCode, inviteCode))
    if (!family) throw new HttpError(404, 'family_not_found')

    // Confronto esatto a meno delle maiuscole. Non ilike: il nome arriva dall'utente
    // e li dentro "%" varrebbe come carattere jolly, agganciando il primo membro capitato
    let [member] = await db
      .select()
      .from(members)
      .where(
        and(
          eq(members.familyId, family.id),
          sql`lower(${members.displayName}) = lower(${displayName})`,
        ),
      )

    if (member && !claimExisting) throw new HttpError(409, 'name_taken')

    if (!member) {
      ;[member] = await db
        .insert(members)
        .values({ id: crypto.randomUUID(), familyId: family.id, displayName })
        .returning()
    }

    const token = await signSession({
      familyId: family.id,
      memberId: member.id,
      displayName: member.displayName,
    })

    return json(200, { token, family, member })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
