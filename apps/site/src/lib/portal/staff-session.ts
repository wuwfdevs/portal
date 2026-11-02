// The site's own staff session, issued after a Portal sign-in has been verified. Pure (Web Crypto only).
//
// Payload's built-in JWT sessions cannot be created without a password, and the function that adds a session
// is internal to Payload, so a Portal sign-in uses the supported extension point instead: this signed cookie,
// accepted by a custom auth strategy (strategy.ts). Payload's own login stays for the break-glass administrator.
//
// A session is only a claim "this Payload user signed in at time T". Revocation lives on the user
// (`sessionsValidAfter`): any session issued before it is dead, which is how logout and an administrator's
// "sign everyone out" work even though the browser keeps the cookie.

import { fromBase64Url, fromUtf8, hmacSha256, hmacSha256Verify, toBase64Url, utf8 } from '@wuwf/portal-contracts'

export const STAFF_SESSION_COOKIE = 'wuwf_staff'
/** A working day. Access the Portal revokes lasts at most this long, unless an administrator signs the person out. */
export const STAFF_SESSION_SECONDS = 8 * 60 * 60

const PURPOSE = 'wuwf-staff-session-v1'

/** A key for this purpose only, derived from the app's secret so a session token can never be mistaken for anything else. */
export async function deriveSessionKey(appSecret: string): Promise<string> {
  return toBase64Url(await hmacSha256(appSecret, PURPOSE))
}

export interface StaffSessionClaims {
  /** The Payload user id. */
  sub: string
  iat: number
  exp: number
}

export async function mintStaffSession(
  input: { userId: string | number; now?: number; ttlSeconds?: number },
  key: string,
): Promise<string> {
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const ttl = Math.min(input.ttlSeconds ?? STAFF_SESSION_SECONDS, STAFF_SESSION_SECONDS)
  if (ttl <= 0) throw new Error('Session lifetime must be positive')
  const claims: StaffSessionClaims = { sub: String(input.userId), iat: now, exp: now + ttl }
  const body = toBase64Url(utf8(JSON.stringify(claims)))
  return `${body}.${toBase64Url(await hmacSha256(key, body))}`
}

export type SessionFailure = 'malformed' | 'bad_signature' | 'expired' | 'invalid_claims'
export type SessionResult = { ok: true; claims: StaffSessionClaims } | { ok: false; reason: SessionFailure }

export async function verifyStaffSession(token: string, key: string, now: number = Math.floor(Date.now() / 1000)): Promise<SessionResult> {
  const parts = token.split('.')
  if (parts.length !== 2) return { ok: false, reason: 'malformed' }
  const [body, sig] = parts as [string, string]
  const bodyBytes = fromBase64Url(body)
  const sigBytes = fromBase64Url(sig)
  if (!bodyBytes || !sigBytes) return { ok: false, reason: 'malformed' }
  if (!(await hmacSha256Verify(key, body, sigBytes))) return { ok: false, reason: 'bad_signature' }
  let c: unknown
  try {
    c = JSON.parse(fromUtf8(bodyBytes))
  } catch {
    return { ok: false, reason: 'malformed' }
  }
  if (typeof c !== 'object' || c === null) return { ok: false, reason: 'malformed' }
  const { sub, iat, exp } = c as Record<string, unknown>
  if (typeof sub !== 'string' || sub === '' || typeof iat !== 'number' || typeof exp !== 'number') return { ok: false, reason: 'invalid_claims' }
  if (exp - iat > STAFF_SESSION_SECONDS || exp <= iat) return { ok: false, reason: 'invalid_claims' }
  if (now >= exp) return { ok: false, reason: 'expired' }
  return { ok: true, claims: { sub, iat, exp } }
}

/** Whether a session issued at `issuedAt` (seconds) predates the user's `sessionsValidAfter`. */
export function isSessionRevoked(issuedAt: number, sessionsValidAfter: string | Date | null | undefined): boolean {
  if (!sessionsValidAfter) return false
  const cutoff = new Date(sessionsValidAfter).getTime()
  if (Number.isNaN(cutoff)) return true // an unreadable cutoff must not quietly un-revoke anyone
  return issuedAt * 1000 < cutoff
}

export function sessionCookie(token: string, opts: { secure: boolean; maxAgeSeconds?: number }): string {
  const parts = [`${STAFF_SESSION_COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${opts.maxAgeSeconds ?? STAFF_SESSION_SECONDS}`]
  if (opts.secure) parts.push('Secure')
  return parts.join('; ')
}

export function expiredSessionCookie(secure: boolean): string {
  return sessionCookie('', { secure, maxAgeSeconds: 0 })
}

/** Reads one cookie from a Cookie header without trusting its shape. */
export function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null
  }
  return null
}
