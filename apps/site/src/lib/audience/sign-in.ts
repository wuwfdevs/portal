import type { Payload } from 'payload'

import type { AudienceAuth, AudienceUser } from './auth'
import { normalizeEmail, signInClientKey, signInRateDecision } from './rules'

export type SignInOutcome =
  | { kind: 'sent' }
  | { kind: 'invalid-email' }
  | { kind: 'limited'; retryAfter: 'hour' | 'day' | 'minute' }
  | { kind: 'unavailable' }

export interface SignInInput {
  email: unknown
  honeypot: unknown
  /** The client's address, from the proxy header; only a keyed hash of it is stored. */
  address: string
  /** This site's origin, for the link's way back. */
  origin: string
  now: Date
}

/** How long a counted request is kept. It exists only to count recent requests (the community calendar uses the same ledger). */
const KEEP_MS = 48 * 3_600_000

/**
 * Asks for a sign-in link. Says "sent" whether or not the address has an account, so the form never tells anyone who has one.
 * Nothing about the email address is stored or logged by the site.
 */
export async function requestSignIn(payload: Payload, auth: AudienceAuth, input: SignInInput, secret: string): Promise<SignInOutcome> {
  // A bot fills the field a person never sees: say "sent", send nothing.
  if (typeof input.honeypot === 'string' && input.honeypot.trim() !== '') return { kind: 'sent' }
  const email = normalizeEmail(input.email)
  if (!email) return { kind: 'invalid-email' }

  const key = signInClientKey(input.address, secret)
  const since = (ms: number) => new Date(input.now.getTime() - ms).toISOString()
  await payload.delete({ collection: 'submission-rate-limits', where: { createdAt: { less_than: since(KEEP_MS) } }, overrideAccess: true, context: { disableRevalidate: true } })
  const [hour, day] = await Promise.all([
    payload.count({ collection: 'submission-rate-limits', overrideAccess: true, where: { and: [{ key: { equals: key } }, { createdAt: { greater_than: since(3_600_000) } }] } }),
    payload.count({ collection: 'submission-rate-limits', overrideAccess: true, where: { and: [{ key: { equals: key } }, { createdAt: { greater_than: since(24 * 3_600_000) } }] } }),
  ])
  const rate = signInRateDecision({ lastHour: hour.totalDocs, lastDay: day.totalDocs })
  if (!rate.allowed) return { kind: 'limited', retryAfter: rate.retryAfter }
  await payload.create({ collection: 'submission-rate-limits', data: { key }, overrideAccess: true, context: { disableRevalidate: true } })

  // The email template appends `?token_hash=…&type=email` to this address (ROADMAP → Phase 7b), so it carries no query of its own;
  // where to go afterwards travels in a short-lived cookie the caller sets.
  const sent = await auth.sendSignInLink(email, confirmUrl(input.origin))
  if (sent.ok) return { kind: 'sent' }
  if (sent.reason === 'too-soon') return { kind: 'limited', retryAfter: 'minute' }
  return { kind: 'unavailable' }
}

/**
 * The audience profile for a signed-in reader: one per Supabase user id, made at the first sign-in, its last sign-in stamped
 * each time. It holds no email address (that stays in Supabase Auth) and no membership: memberships are linked in 7c, never
 * on an email match alone.
 */
export async function recordSignIn(payload: Payload, user: AudienceUser, now: Date): Promise<{ id: string | number }> {
  const found = await payload.find({ collection: 'audience-profiles', where: { supabaseUserId: { equals: user.id } }, limit: 1, depth: 0, overrideAccess: true, pagination: false })
  const at = now.toISOString()
  if (found.docs[0]) {
    return payload.update({ collection: 'audience-profiles', id: found.docs[0].id, data: { lastSignInAt: at }, overrideAccess: true, context: { disableRevalidate: true } })
  }
  return payload.create({ collection: 'audience-profiles', data: { supabaseUserId: user.id, firstSignInAt: at, lastSignInAt: at }, overrideAccess: true, context: { disableRevalidate: true } })
}

/** The address the emailed link returns to. It must be in the Supabase project's allowed redirect URLs. */
export const confirmUrl = (origin: string): string => new URL('/account/confirm', origin).toString()

/** The cookie that remembers where a reader was going when they asked for a link. */
export const NEXT_COOKIE = 'wuwf_signin_next'
