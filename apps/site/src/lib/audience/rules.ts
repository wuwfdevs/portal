// Audience sign-in rules (phase 7b). Pure: no Payload, no Next, no Supabase.
//
// Readers never need an account to read, listen, give or answer a question (CLAUDE.md). An account is for members' things
// that follow in 7c and 7d. Sign-in is passwordless: an emailed one-time link, sent by Supabase Auth through Resend.

import { createHmac } from 'node:crypto'

/** A plain, sane email address, trimmed and lower-cased; null when it is not one. Supabase checks it again. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  if (email.length < 3 || email.length > 254) return null
  return /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i.test(email) ? email : null
}

/**
 * Where to send someone after signing in: a path on this site only. Anything else (another host, `//host`, a backslash trick,
 * a scheme) becomes the account page, so a sign-in link can never be used to bounce a reader to another site.
 */
export function safeNext(raw: unknown, fallback = '/account'): string {
  if (typeof raw !== 'string') return fallback
  const next = raw.trim()
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('\\') || /[\u0000-\u001f]/.test(next)) return fallback
  try {
    const u = new URL(next, 'https://site.invalid')
    return u.origin === 'https://site.invalid' ? `${u.pathname}${u.search}${u.hash}` : fallback
  } catch {
    return fallback
  }
}

/** Link types the confirm route accepts from an email: the sign-in link and the first-time confirmation (Supabase sends one or the other). */
export const LINK_TYPES = ['email', 'magiclink', 'signup'] as const
export type LinkType = (typeof LINK_TYPES)[number]
export const isLinkType = (v: unknown): v is LinkType => typeof v === 'string' && (LINK_TYPES as readonly string[]).includes(v)

/** Sign-in requests one client may make. Supabase also allows one link per address per minute and caps the project's email per hour. */
export const SIGN_IN_RATE = { perHour: 6, perDay: 20 } as const

export type SignInRate = { allowed: true } | { allowed: false; retryAfter: 'hour' | 'day' }

export function signInRateDecision(counts: { lastHour: number; lastDay: number }): SignInRate {
  if (counts.lastHour >= SIGN_IN_RATE.perHour) return { allowed: false, retryAfter: 'hour' }
  if (counts.lastDay >= SIGN_IN_RATE.perDay) return { allowed: false, retryAfter: 'day' }
  return { allowed: true }
}

/** The key a sign-in request is counted under: a keyed hash of the client address, never the address (or the email). */
export function signInClientKey(address: string, secret: string): string {
  return `signin:${createHmac('sha256', secret).update(`signin-client:${address}`).digest('hex').slice(0, 24)}`
}

