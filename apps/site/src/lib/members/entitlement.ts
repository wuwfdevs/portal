// Members' listening (phase 7c). Pure: no Payload, no Next.
//
// The system is WUWF's own: a regular sustaining membership at the station's qualifying level carries members' listening
// (members-only episodes, Field Notes and archive files on every WUWF original). No show has a level of its own. The site is not
// the ledger: Member Services records a qualifying membership here by hand (7c), the membership database later (7e), and access
// checks read only that record, never a gift or a payment.

import { createHash, randomBytes } from 'node:crypto'

/** Days a membership keeps working past its end date, to cover a monthly card that fails and is retried. */
export const GRACE_DAYS = 14

/** How long a claim link works. */
export const CLAIM_DAYS = 14

const DAY_MS = 24 * 3_600_000

/**
 * Whether a membership ending on `endsOn` (a calendar day, "YYYY-MM-DD" or an ISO date) still gives access at `now`: through the
 * whole end day, then the grace period.
 */
export function isActive(endsOn: string | null | undefined, now: Date): boolean {
  const day = typeof endsOn === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(endsOn)?.[1] : undefined
  if (!day) return false
  // The end of the end day, generously (UTC+14 covers every zone), then the grace days.
  const last = Date.parse(`${day}T23:59:59.999Z`) + 14 * 3_600_000 + GRACE_DAYS * DAY_MS
  return now.getTime() <= last
}

/** True while a membership's end date has passed but its grace period has not. */
export function inGrace(endsOn: string | null | undefined, now: Date): boolean {
  const day = typeof endsOn === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(endsOn)?.[1] : undefined
  if (!day) return false
  return now.getTime() > Date.parse(`${day}T23:59:59.999Z`) + 14 * 3_600_000 && isActive(endsOn, now)
}

/** A new claim token: the raw value goes in the email only; the site stores its hash. */
export function newClaimToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashClaimToken(token) }
}

export const hashClaimToken = (token: string): string => createHash('sha256').update(token).digest('hex')

/** A token that could be one of ours (shape only); anything else is refused before a lookup. */
export const looksLikeClaimToken = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v)

export function claimExpiry(now: Date): string {
  return new Date(now.getTime() + CLAIM_DAYS * DAY_MS).toISOString()
}

/** The plain-text claim email. Member Services' wording to confirm. */
export function claimEmail(input: { name: string; url: string }): { subject: string; text: string } {
  return {
    subject: 'Connect your WUWF membership to wuwf.org',
    text: [
      `Hello ${input.name},`,
      '',
      'Thank you for being a WUWF sustaining member. Your membership includes members-only episodes and more from WUWF originals on wuwf.org.',
      '',
      `To connect your membership to a wuwf.org account, open this link within ${CLAIM_DAYS} days:`,
      input.url,
      '',
      'You can sign in with any email address you like; the link connects your membership to that account. It works once.',
      '',
      'If you did not expect this email, you can ignore it.',
      '',
      'WUWF Member Services',
    ].join('\n'),
  }
}
