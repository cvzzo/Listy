import { clearSession, getSession } from '../auth/session'

export class ApiError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const session = getSession()
  const headers = new Headers(options.headers)
  headers.set('content-type', 'application/json')
  if (session) headers.set('authorization', `Bearer ${session.token}`)

  const res = await fetch(`/api${path}`, { ...options, headers })

  if (res.status === 401) {
    clearSession()
    window.location.href = '/'
    throw new ApiError(401, 'unauthorized')
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new ApiError(res.status, body.error ?? `request_failed_${res.status}`)
  }

  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
