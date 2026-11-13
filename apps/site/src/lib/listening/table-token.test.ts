import { describe, expect, it } from 'vitest'

import { cookieMaxAgeSeconds, isTableLinkToken, isTableSessionToken } from './table-token'

const TOKEN = 'a'.repeat(43)

describe('table tokens', () => {
  it('accepts exactly 43 base64url characters', () => {
    expect(isTableLinkToken(TOKEN)).toBe(true)
    expect(isTableSessionToken(`${'A1_-'.repeat(10)}abc`)).toBe(true)
  })
  it('refuses anything else', () => {
    expect(isTableLinkToken('a'.repeat(42))).toBe(false)
    expect(isTableLinkToken('a'.repeat(44))).toBe(false)
    expect(isTableLinkToken(`${'a'.repeat(42)}/`)).toBe(false)
    expect(isTableLinkToken(`${'a'.repeat(42)} `)).toBe(false)
    expect(isTableSessionToken(undefined)).toBe(false)
    expect(isTableSessionToken(null)).toBe(false)
    expect(isTableSessionToken(42)).toBe(false)
  })
})

describe('cookieMaxAgeSeconds', () => {
  const now = new Date('2026-11-15T18:00:00Z')
  it('lasts until the Portal session ends', () => {
    expect(cookieMaxAgeSeconds('2026-11-15T20:00:00Z', now)).toBe(2 * 60 * 60)
  })
  it('is capped at two days and floored at a minute', () => {
    expect(cookieMaxAgeSeconds('2026-12-25T00:00:00Z', now)).toBe(2 * 24 * 60 * 60)
    expect(cookieMaxAgeSeconds('2026-11-15T17:00:00Z', now)).toBe(60)
  })
  it('falls back to twelve hours for a time it cannot read', () => {
    expect(cookieMaxAgeSeconds('soon', now)).toBe(12 * 60 * 60)
  })
})
