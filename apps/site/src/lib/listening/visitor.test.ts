import { isListeningSubject } from '@wuwf/portal-contracts'
import { describe, expect, it } from 'vitest'

import { clientAddressFrom, hashClientAddress, isVisitorId, newVisitorId, visitorSubject } from './visitor'

describe('visitor ids', () => {
  it('are random, url-safe, and accepted as a contract subject', () => {
    const a = newVisitorId()
    expect(a).not.toBe(newVisitorId())
    expect(isVisitorId(a)).toBe(true)
    expect(isListeningSubject(visitorSubject(a))).toBe(true)
  })

  it('refuse anything else', () => {
    for (const bad of ['', 'short', 'has spaces in it padded out 123', 'a@b.org-padded-out-to-length', 5, null, 'x'.repeat(129)]) {
      expect(isVisitorId(bad)).toBe(false)
    }
  })
})

describe('client addresses', () => {
  const headers = (h: Record<string, string>) => ({ get: (name: string) => h[name] ?? null })

  it('takes the first forwarded address', () => {
    expect(clientAddressFrom(headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9')
    expect(clientAddressFrom(headers({ 'x-real-ip': '203.0.113.7' }))).toBe('203.0.113.7')
    expect(clientAddressFrom(headers({}))).toBeNull()
  })

  it('hashes to a url-safe value that changes by day and by key, and never contains the address', () => {
    const day1 = new Date('2026-11-09T12:00:00Z')
    const day2 = new Date('2026-11-10T12:00:00Z')
    const a = hashClientAddress('203.0.113.9', 'key-one', day1)
    expect(a).toMatch(/^[a-f0-9]{48}$/)
    expect(a).toBe(hashClientAddress('203.0.113.9', 'key-one', day1))
    expect(a).not.toBe(hashClientAddress('203.0.113.9', 'key-one', day2))
    expect(a).not.toBe(hashClientAddress('203.0.113.9', 'key-two', day1))
    expect(a).not.toBe(hashClientAddress('203.0.113.8', 'key-one', day1))
    expect(a).not.toContain('203')
  })
})
