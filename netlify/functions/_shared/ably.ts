import { Rest } from 'ably'

let restClient: Rest | undefined

function getAblyRest() {
  if (!restClient) {
    const apiKey = process.env.ABLY_API_KEY
    if (!apiKey) throw new Error('ABLY_API_KEY is not set')
    restClient = new Rest(apiKey)
  }
  return restClient
}

export type MutationEntity = 'list' | 'category' | 'item'

export async function publishMutation(
  familyId: string,
  entity: MutationEntity,
  row: unknown,
) {
  try {
    const channel = getAblyRest().channels.get(`family:${familyId}`)
    await channel.publish('mutation', { entity, row })
  } catch (err) {
    // Ably è solo un hint a bassa latenza: se la pubblicazione fallisce, i client
    // recuperano comunque lo stato tramite sync-pull, quindi non blocchiamo la mutazione.
    console.error('ably publish failed', err)
  }
}

export function createFamilyTokenRequest(familyId: string, memberId: string) {
  return getAblyRest().auth.createTokenRequest({
    clientId: memberId,
    capability: { [`family:${familyId}`]: ['subscribe'] },
  })
}
