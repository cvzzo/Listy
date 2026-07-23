import { Realtime } from 'ably'
import { getSession } from '../auth/session'

let realtimeClient: Realtime | undefined

export function getAblyClient() {
  if (realtimeClient) return realtimeClient

  const session = getSession()
  if (!session) throw new Error('no session')

  realtimeClient = new Realtime({
    authUrl: '/api/ably-token',
    authMethod: 'GET',
    authHeaders: { authorization: `Bearer ${session.token}` },
  })
  return realtimeClient
}
