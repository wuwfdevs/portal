import { describe, expect, it } from 'vitest'

import { claimEmail, CLAIM_DAYS, claimExpiry, GRACE_DAYS, hashClaimToken, inGrace, isActive, looksLikeClaimToken, newClaimToken } from './entitlement'

describe("members' listening entitlement", () => {
  it('lasts through the end day and the grace period, then stops', () => {
    expect(GRACE_DAYS).toBe(14)
    expect(isActive('2026-11-30', new Date('2026-11-30T23:00:00-06:00'))).toBe(true)
    expect(isActive('2026-11-30', new Date('2026-12-10T12:00:00Z'))).toBe(true)
    expect(inGrace('2026-11-30', new Date('2026-12-10T12:00:00Z'))).toBe(true)
    expect(inGrace('2026-11-30', new Date('2026-11-29T12:00:00Z'))).toBe(false)
    expect(isActive('2026-11-30', new Date('2026-12-16T12:00:00Z'))).toBe(false)
    expect(isActive('2026-11-30T00:00:00.000Z', new Date('2026-12-01T12:00:00Z'))).toBe(true)
  })

  it('gives nothing without an end date', () => {
    expect(isActive(null, new Date())).toBe(false)
    expect(isActive('', new Date())).toBe(false)
    expect(isActive('soon', new Date())).toBe(false)
  })

  it('makes claim tokens whose hash, not the token, is kept', () => {
    const a = newClaimToken()
    const b = newClaimToken()
    expect(a.token).not.toBe(b.token)
    expect(looksLikeClaimToken(a.token)).toBe(true)
    expect(a.hash).toBe(hashClaimToken(a.token))
    expect(a.hash).not.toContain(a.token)
    for (const bad of ['', 'short', `${a.token}x`, 'a'.repeat(42) + '!', null]) expect(looksLikeClaimToken(bad)).toBe(false)
  })

  it('lets a claim link work for two weeks', () => {
    expect(CLAIM_DAYS).toBe(14)
    expect(claimExpiry(new Date('2026-11-06T00:00:00Z'))).toBe('2026-11-20T00:00:00.000Z')
  })

  it('writes the claim email with the link and no promise beyond the membership', () => {
    const { subject, text } = claimEmail({ name: 'Leigh', url: 'https://wuwf.org/account/claim?token=abc' })
    expect(subject).toBe('Connect your WUWF membership to wuwf.org')
    expect(text).toContain('Hello Leigh,')
    expect(text).toContain('https://wuwf.org/account/claim?token=abc')
    expect(text).not.toMatch(/subscri/i)
  })
})
