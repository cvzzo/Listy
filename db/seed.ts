import 'dotenv/config'
import { getDb } from './client'
import { families, members } from './schema'

async function main() {
  const db = getDb()

  const [family] = await db
    .insert(families)
    .values({ id: crypto.randomUUID(), name: 'Famiglia di prova', inviteCode: 'DEMO01' })
    .returning()

  const [member] = await db
    .insert(members)
    .values({ id: crypto.randomUUID(), familyId: family.id, displayName: 'Demo' })
    .returning()

  console.log(JSON.stringify({ family, member }, null, 2))
}

main()
