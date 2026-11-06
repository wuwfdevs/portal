import { describe, expect, it } from 'vitest'

import { isLinkType, normalizeEmail, safeNext, signInClientKey, signInRateDecision } from './rules'

describe('audience sign-in rules', () => {
  it('accepts a plain address, trimmed and lower-cased, and nothing else', () => {
    expect(normalizeEmail('  Leigh@Example.ORG ')).toBe('leigh@example.org')
    expect(normalizeEmail('a@b.co')).toBe('a@b.co')
    for (const bad of ['', 'no-at', 'a@b', 'a b@c.org', '<a@b.org>', 'a@b.org,c@d.org', null, 42, 'x'.repeat(250) + '@b.org']) {
      expect(normalizeEmail(bad)).toBeNull()
    }
  })

  it('sends a reader back only to a path on this site', () => {
    expect(safeNext('/shows/barefoot-mary/support')).toBe('/shows/barefoot-mary/support')
    expect(safeNext('/account?tab=feeds#x')).toBe('/account?tab=feeds#x')
    for (const bad of ['https://evil.example/', '//evil.example', '/\\evil.example', 'javascript:alert(1)', 'account', '/a\nb', '', undefined]) {
      expect(safeNext(bad)).toBe('/account')
    }
  })

  it('takes only the link types Supabase sends for sign-in', () => {
    expect(isLinkType('email')).toBe(true)
    expect(isLinkType('signup')).toBe(true)
    expect(isLinkType('recovery')).toBe(false)
    expect(isLinkType('invite')).toBe(false)
  })

  it('limits a client to a few requests an hour and a day', () => {
    expect(signInRateDecision({ lastHour: 5, lastDay: 5 })).toEqual({ allowed: true })
    expect(signInRateDecision({ lastHour: 6, lastDay: 6 })).toEqual({ allowed: false, retryAfter: 'hour' })
    expect(signInRateDecision({ lastHour: 0, lastDay: 20 })).toEqual({ allowed: false, retryAfter: 'day' })
  })

  it('counts a client by a keyed hash, never the address itself', () => {
    const k = signInClientKey('203.0.113.9', 'secret')
    expect(k).toMatch(/^signin:[0-9a-f]{24}$/)
    expect(k).not.toContain('203')
    expect(signInClientKey('203.0.113.9', 'other')).not.toBe(k)
  })
})
