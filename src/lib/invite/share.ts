import type { Family } from '../types'

/**
 * L'indirizzo che porta dritti dentro la famiglia: chi lo apre deve solo dire come
 * si chiama. Il codice resta nel link, cosi non c'e niente da ricopiare a mano.
 */
export function inviteLink(family: Family): string {
  return `${window.location.origin}/invito/${family.inviteCode}`
}

/**
 * Passa l'invito con il foglio di condivisione del sistema dove c'e, con gli
 * appunti dove non c'e. Ritorna 'copied' quando serve dirlo a schermo: il foglio
 * di condivisione si vede da se, gli appunti no.
 */
export async function shareInvite(family: Family): Promise<'shared' | 'copied' | 'cancelled'> {
  const link = inviteLink(family)
  const text = `Ti va di condividere la lista della spesa? Entra in "${family.name}" su Listy:`

  if (navigator.share) {
    try {
      // Il link va nel campo suo: le app di messaggistica lo riconoscono come tale
      // e ne mostrano l'anteprima, invece di trattarlo come testo qualunque
      await navigator.share({ title: 'Listy', text, url: link })
      return 'shared'
    } catch {
      // condivisione annullata dall'utente, nessuna azione necessaria
      return 'cancelled'
    }
  }

  await navigator.clipboard.writeText(`${text} ${link}`)
  return 'copied'
}
