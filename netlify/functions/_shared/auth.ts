import type { HandlerEvent } from '@netlify/functions'
import { SignJWT, jwtVerify } from 'jose'
import { HttpError } from './response'

export type SessionPayload = {
  familyId: string
  memberId: string
  displayName: string
}

function getSecretKey() {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return new TextEncoder().encode(secret)
}

export async function signSession(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('365d')
    .sign(getSecretKey())
}

export async function verifySession(event: HandlerEvent): Promise<SessionPayload> {
  const authHeader = event.headers.authorization ?? event.headers.Authorization
  const token = authHeader?.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'missing_token')

  try {
    const { payload } = await jwtVerify(token, getSecretKey(), { algorithms: ['HS256'] })
    return payload as unknown as SessionPayload
  } catch {
    throw new HttpError(401, 'invalid_token')
  }
}
