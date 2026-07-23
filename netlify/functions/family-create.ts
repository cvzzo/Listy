import type { Handler } from '@netlify/functions'
import { getDb } from '../../db/client'
import { families, members } from '../../db/schema'
import { json, HttpError } from './_shared/response'
import { signSession } from './_shared/auth'
import { generateInviteCode } from './_shared/invite-code'

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') throw new HttpError(405, 'method not allowed')

    const body = JSON.parse(event.body ?? '{}')
    const familyName = String(body.familyName ?? '').trim()
    const displayName = String(body.displayName ?? '').trim()
    if (!familyName || !displayName) {
      throw new HttpError(400, 'familyName and displayName are required')
    }

    const db = getDb()

    let family
    for (let attempt = 0; attempt < 5 && !family; attempt++) {
      try {
        ;[family] = await db
          .insert(families)
          .values({ id: crypto.randomUUID(), name: familyName, inviteCode: generateInviteCode() })
          .returning()
      } catch {
        // collisione (improbabile) sul codice invito univoco: riprova con uno nuovo
      }
    }
    if (!family) throw new HttpError(500, 'could_not_create_family')

    const [member] = await db
      .insert(members)
      .values({ id: crypto.randomUUID(), familyId: family.id, displayName })
      .returning()

    const token = await signSession({
      familyId: family.id,
      memberId: member.id,
      displayName: member.displayName,
    })

    return json(201, { token, family, member })
  } catch (err) {
    if (err instanceof HttpError) return json(err.statusCode, { error: err.message })
    console.error(err)
    return json(500, { error: 'internal_error' })
  }
}
