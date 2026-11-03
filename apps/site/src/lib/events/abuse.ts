// Abuse controls for the public submission form. No CAPTCHA and no third-party script (site rule: no third-party tracking):
//   1. a honeypot field real visitors never see or fill;
//   2. a signed token issued when the form is shown, which proves the form was open for a human-plausible time;
//   3. a rate limit per client, counted from the review queue itself (a keyed hash of the address, never the address).
// Each is a small pure function over values the caller supplies, so each is tested alone.

import { createHmac, timingSafeEqual } from 'node:crypto'

/** The hidden field's name looks like something a bot wants to fill. It must arrive empty. */
export const HONEYPOT_FIELD = 'organization-url'
export const TOKEN_FIELD = 'form-token'

/** Fastest a person can plausibly fill the form, and how long a rendered form stays valid. */
export const MIN_FILL_MS = 4_000
export const MAX_FORM_AGE_MS = 6 * 3_600_000

export const RATE = { perHour: 3, perDay: 10 } as const

const sign = (issuedAt: number, secret: string): string => createHmac('sha256', secret).update(`event-form:${issuedAt}`).digest('base64url')

/** `issuedAt.signature`. */
export function issueFormToken(now: Date, secret: string): string {
  const t = now.getTime()
  return `${t}.${sign(t, secret)}`
}

export type TokenCheck = { ok: true } | { ok: false; reason: 'missing' | 'forged' | 'too-fast' | 'expired' }

export function checkFormToken(token: unknown, now: Date, secret: string): TokenCheck {
  if (typeof token !== 'string') return { ok: false, reason: 'missing' }
  const [stamp, sig, ...rest] = token.split('.')
  if (!stamp || !sig || rest.length || !/^\d{10,16}$/.test(stamp)) return { ok: false, reason: 'missing' }
  const want = Buffer.from(sign(Number(stamp), secret))
  const got = Buffer.from(sig)
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, reason: 'forged' }
  const age = now.getTime() - Number(stamp)
  if (age < MIN_FILL_MS) return { ok: false, reason: 'too-fast' }
  if (age > MAX_FORM_AGE_MS) return { ok: false, reason: 'expired' }
  return { ok: true }
}

/** The honeypot is clean when absent or blank. */
export const honeypotClean = (value: unknown): boolean => value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

/** A keyed hash of a client address: stable enough to count by, useless for anything else. Truncated. */
export function clientKey(address: string, secret: string): string {
  return createHmac('sha256', secret).update(`event-client:${address}`).digest('hex').slice(0, 24)
}

export type RateDecision = { allowed: true } | { allowed: false; retryAfter: 'hour' | 'day' }

/** `lastHour` and `lastDay` are how many submissions this client already made in those windows. */
export function rateDecision(counts: { lastHour: number; lastDay: number }): RateDecision {
  if (counts.lastHour >= RATE.perHour) return { allowed: false, retryAfter: 'hour' }
  if (counts.lastDay >= RATE.perDay) return { allowed: false, retryAfter: 'day' }
  return { allowed: true }
}

/** The client address from a proxy header: the first hop only, and only if it looks like an address. */
export function clientAddress(forwardedFor: string | null | undefined): string {
  const first = (forwardedFor ?? '').split(',')[0]?.trim() ?? ''
  return /^[0-9a-fA-F:.]{3,45}$/.test(first) ? first : 'unknown'
}

/** Image files a submitter may attach: type by content, not by name; a size ceiling; the pixel range the form promises. */
export const IMAGE = { maxBytes: 4 * 1024 * 1024, minPixels: 300, maxPixels: 2000 } as const

export type ImageKind = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

/** The image type from the first bytes, or null. A file named .jpg that is not one is refused. */
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  const b = bytes
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png'
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 && (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61) return 'image/gif'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}
