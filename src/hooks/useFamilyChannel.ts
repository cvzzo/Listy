import { useEffect, useRef } from 'react'
import type { Message } from 'ably'
import { getAblyClient } from '../lib/ably/client'
import { getSession } from '../lib/auth/session'
import type { Category, Item, List } from '../lib/types'

export type MutationEvent =
  | { entity: 'list'; row: List }
  | { entity: 'category'; row: Category }
  | { entity: 'item'; row: Item }

export function useFamilyChannel(onMutation: (event: MutationEvent) => void) {
  const handlerRef = useRef(onMutation)

  useEffect(() => {
    handlerRef.current = onMutation
  })

  useEffect(() => {
    const session = getSession()
    if (!session) return

    const client = getAblyClient()
    const channel = client.channels.get(`family:${session.family.id}`)
    const listener = (message: Message) => handlerRef.current(message.data as MutationEvent)

    channel.subscribe('mutation', listener)
    return () => {
      channel.unsubscribe('mutation', listener)
    }
  }, [])
}
