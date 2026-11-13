import { LISTENING_TABLE_SESSION_LENGTH, LISTENING_TABLE_TOKEN_LENGTH } from '@wuwf/portal-contracts'

/** Pure checks for the tokens a table's phone carries, so a browser cannot send anything else into a signed body. */
export const TABLE_SESSION_COOKIE = 'wuwf_table_session'

const BASE64URL = /^[A-Za-z0-9_-]+$/

/** The single-use link token in the address the table card's QR code opens: 256 bits in base64url, 43 characters. */
export function isTableLinkToken(value: unknown): value is string {
  return typeof value === 'string' && value.length === LISTENING_TABLE_TOKEN_LENGTH && BASE64URL.test(value)
}

/** The session token the Portal issues when the link is redeemed: the same shape. */
export function isTableSessionToken(value: unknown): value is string {
  return typeof value === 'string' && value.length === LISTENING_TABLE_SESSION_LENGTH && BASE64URL.test(value)
}

/** How long the cookie lives: until the Portal's session ends, never more than two days, never less than a minute. */
export function cookieMaxAgeSeconds(expiresAt: string, now: Date = new Date()): number {
  const ms = Date.parse(expiresAt) - now.getTime()
  if (!Number.isFinite(ms)) return 12 * 60 * 60
  return Math.min(2 * 24 * 60 * 60, Math.max(60, Math.floor(ms / 1000)))
}
