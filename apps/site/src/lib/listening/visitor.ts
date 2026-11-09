import { createHmac, randomBytes } from 'node:crypto'

import { MAX_CLIENT_HASH_LENGTH, MAX_SUBJECT_ID_LENGTH, type ListeningSubject } from '@wuwf/portal-contracts'

/**
 * Who is taking part, as this site knows them. A visitor is a browser carrying our own cookie; the id is random and means
 * nothing outside this site. It is never an email address, a name, or a donor or membership id (the site's identities stay
 * separate), and it is the only thing about a visitor the Portal ever receives.
 */
export const VISITOR_COOKIE = 'wuwf_listening_visitor'
/** How long the cookie lives: long enough to finish a response another day, short enough not to follow a person around. */
export const VISITOR_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60

/** 24 random bytes as base64url: 32 characters of [A-Za-z0-9_-]. */
export function newVisitorId(): string {
  return randomBytes(24).toString('base64url')
}

export function isVisitorId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= MAX_SUBJECT_ID_LENGTH && /^[A-Za-z0-9_-]+$/.test(value)
}

export function visitorSubject(id: string): ListeningSubject {
  return { kind: 'visitor', id }
}

/** The first address in a forwarded-for list: the client the platform saw. Null when there is none. */
export function clientAddressFrom(headers: { get(name: string): string | null }): string | null {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const real = headers.get('x-real-ip')?.trim()
  return forwarded || real || null
}

/**
 * The Portal rate-limits by a hash of the client address so it never stores an address. The hash is keyed with a secret only
 * this site knows and salted with the calendar day (UTC), so the same address is a different value tomorrow and the value
 * cannot be reversed or matched against anything the Portal holds.
 */
export function hashClientAddress(address: string, key: string, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10)
  return createHmac('sha256', key).update(`${day}|${address}`).digest('hex').slice(0, Math.min(48, MAX_CLIENT_HASH_LENGTH))
}
