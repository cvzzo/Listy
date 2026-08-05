import { getSession, getSessions, removeSession, type Session } from '../auth/session'

export class ApiError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

/**
 * `session` serve a chiamare per conto di una famiglia che non e quella aperta:
 * la coda di sincronizzazione svuota anche le mutazioni delle altre, e ognuna va
 * firmata con il proprio token. Senza, vale la famiglia attiva.
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  session: Session | null = getSession(),
): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('content-type', 'application/json')
  if (session) headers.set('authorization', `Bearer ${session.token}`)

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401) {
    // Cade solo la famiglia il cui token non vale piu, le altre restano al loro posto
    if (session) removeSession(session.family.id)
    window.location.href = getSessions().length > 0 ? '/famiglie' : '/'
    throw new ApiError(401, 'unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `request_failed_${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
