import { useEffect, useRef } from 'react'
import type { Message } from 'ably'
import { getAblyClient } from '../lib/ably/client'
import { getSession } from '../lib/auth/session'
import type { Category, Item, List } from '../lib/types'

/** Chi ha fatto la modifica, per attribuirla e per non riannunciarla a lui stesso. */
export type Actor = { id: string; name: string }

export type MutationEvent = { by?: Actor } & (
  | { entity: 'list'; row: List }
  | { entity: 'category'; row: Category }
  | { entity: 'item'; row: Item }
)

export function useFamilyChannel(onMutation: (event: MutationEvent) => void) {
  const handlerRef = useRef(onMutation)
  // Cambiando famiglia cambia il canale: la sottoscrizione va rifatta, altrimenti
  // si continuerebbe ad ascoltare quella di prima
  const familyId = getSession()?.family.id

  useEffect(() => {
    handlerRef.current = onMutation
  })

  useEffect(() => {
    if (!familyId) return

    const client = getAblyClient()
    const channel = client.channels.get(`family:${familyId}`)
    const listener = (message: Message) => handlerRef.current(message.data as MutationEvent)

    channel.subscribe('mutation', listener)
    return () => {
      channel.unsubscribe('mutation', listener)
    }
  }, [familyId])
}
