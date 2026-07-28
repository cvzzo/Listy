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

type Actor = { familyId: string; memberId: string; displayName: string }

export async function publishMutation(actor: Actor, entity: MutationEntity, row: unknown) {
  try {
    const channel = getAblyRest().channels.get(`family:${actor.familyId}`)
    // "by" serve a chi riceve per dire chi ha fatto cosa, e per non annunciare
    // a qualcuno le modifiche che ha appena fatto lui
    await channel.publish('mutation', {
      entity,
      row,
      by: { id: actor.memberId, name: actor.displayName },
    })
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
