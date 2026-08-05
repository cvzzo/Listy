import { apiFetch, ApiError } from '../api/client'
import { addSession, type Session } from '../auth/session'
import type { Family, Member } from '../types'

type AuthResponse = { token: string; family: Family; member: Member }

export type JoinResult =
  | { status: 'joined'; session: Session }
  /**
   * Quel nome e gia di qualcuno nella famiglia. Puo essere la stessa persona che
   * rientra da un altro telefono, o due Marco diversi: a deciderlo e solo chi sta
   * scrivendo, quindi glielo si chiede invece di indovinare.
   */
  | { status: 'name_taken' }

/**
 * Entra in una famiglia col codice invito. `claimExisting` e la risposta a quella
 * domanda: si manda solo dopo che l'utente ha confermato di essere lui.
 */
export async function joinFamily(
  inviteCode: string,
  displayName: string,
  claimExisting = false,
): Promise<JoinResult> {
  try {
    const session = await apiFetch<AuthResponse>(
      '/family-join',
      {
        method: 'POST',
        body: JSON.stringify({ inviteCode, displayName, claimExisting }),
      },
      // Senza sessione: entrare in una famiglia non richiede un token, e mandare
      // quello della famiglia attiva confonderebbe le acque
      null,
    )
    addSession(session)
    return { status: 'joined', session }
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 409) return { status: 'name_taken' }
    throw err
  }
}
