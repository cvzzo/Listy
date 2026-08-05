import type { Family } from '../types'

/**
 * Passa il codice invito con il foglio di condivisione del sistema dove c'e, con
 * gli appunti dove non c'e. Ritorna 'copied' quando serve dirlo a schermo: il
 * foglio di condivisione si vede da se, gli appunti no.
 */
export async function shareInviteCode(family: Family): Promise<'shared' | 'copied' | 'cancelled'> {
  const text = `Unisciti alla nostra lista della spesa su Listy! Codice invito: ${family.inviteCode}`

  if (navigator.share) {
    try {
      await navigator.share({ title: 'Listy', text })
      return 'shared'
    } catch {
      // condivisione annullata dall'utente, nessuna azione necessaria
      return 'cancelled'
    }
  }

  await navigator.clipboard.writeText(text)
  return 'copied'
}
