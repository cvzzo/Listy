import { Realtime } from 'ably'
import { getSession } from '../auth/session'

let realtimeClient: Realtime | undefined
/** Per quale famiglia e stato aperto il client attuale. */
let connectedFamilyId: string | undefined

export function getAblyClient() {
  const session = getSession()
  if (!session) throw new Error('no session')

  // Il token e legato alla famiglia e da diritto di ascolto solo sul suo canale:
  // cambiando famiglia il client va rifatto, non riusato
  if (realtimeClient && connectedFamilyId !== session.family.id) closeAblyClient()

  if (!realtimeClient) {
    realtimeClient = new Realtime({
      authUrl: '/api/ably-token',
      authMethod: 'GET',
      authHeaders: { authorization: `Bearer ${session.token}` },
    })
    connectedFamilyId = session.family.id
  }
  return realtimeClient
}

export function closeAblyClient() {
  realtimeClient?.close()
  realtimeClient = undefined
  connectedFamilyId = undefined
}
