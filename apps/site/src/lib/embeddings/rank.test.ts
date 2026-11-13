import { describe, expect, it } from 'vitest'

import { MIN_RELATED_SIMILARITY, pickRelated, recencyFactor } from './rank'

const now = new Date('2026-11-13T12:00:00Z')

describe('recencyFactor', () => {
  it('is 1 for now and falls toward 0.85 for old work, never below', () => {
    expect(recencyFactor('2026-11-13T12:00:00Z', now)).toBeCloseTo(1, 5)
    expect(recencyFactor('2013-01-01T00:00:00Z', now)).toBeGreaterThanOrEqual(0.85)
    expect(recencyFactor('2013-01-01T00:00:00Z', now)).toBeLessThan(0.86)
  })
  it('treats a missing date as old, and a future date as now', () => {
    expect(recencyFactor(null, now)).toBe(0.85)
    expect(recencyFactor('2030-01-01T00:00:00Z', now)).toBeCloseTo(1, 5)
  })
})

describe('pickRelated', () => {
  const c = (id: number, similarity: number, extra: Partial<{ publishedAt: string; seriesKey: string }> = {}) => ({ id, similarity, ...extra })

  it('drops the story itself and anything under the floor', () => {
    const out = pickRelated(1, [c(1, 0.99), c(2, MIN_RELATED_SIMILARITY - 0.01), c(3, 0.6)], now)
    expect(out.map((x) => x.id)).toEqual([3])
  })

  it('compares ids as text, so 1 and "1" are the same story', () => {
    expect(pickRelated('1', [c(1, 0.9), c(2, 0.8)], now).map((x) => x.id)).toEqual([2])
  })

  it('puts the closer story first', () => {
    const out = pickRelated(0, [c(1, 0.5, { publishedAt: '2026-11-01T00:00:00Z' }), c(2, 0.7, { publishedAt: '2026-11-01T00:00:00Z' })], now)
    expect(out.map((x) => x.id)).toEqual([2, 1])
  })

  it('breaks a near tie toward the newer story, but not against a clearly closer old one', () => {
    const tie = pickRelated(0, [c(1, 0.6, { publishedAt: '2014-01-01T00:00:00Z' }), c(2, 0.6, { publishedAt: '2026-10-01T00:00:00Z' })], now)
    expect(tie.map((x) => x.id)).toEqual([2, 1])
    const closer = pickRelated(0, [c(1, 0.8, { publishedAt: '2014-01-01T00:00:00Z' }), c(2, 0.6, { publishedAt: '2026-10-01T00:00:00Z' })], now)
    expect(closer.map((x) => x.id)).toEqual([1, 2])
  })

  it('caps stories from one series, so instalments do not fill the list', () => {
    const many = [1, 2, 3, 4, 5].map((id) => c(id, 0.9 - id / 100, { seriesKey: 'series-a' }))
    const out = pickRelated(0, [...many, c(9, 0.4)], now)
    expect(out.map((x) => x.id)).toEqual([1, 2, 9])
  })

  it('returns no more than the limit, and nothing when nothing is close', () => {
    const lots = Array.from({ length: 10 }, (_, i) => c(i + 1, 0.9 - i / 100))
    expect(pickRelated(0, lots, now)).toHaveLength(4)
    expect(pickRelated(0, [c(1, 0.1)], now)).toEqual([])
    expect(pickRelated(0, [], now)).toEqual([])
  })

  it('is deterministic when scores are equal', () => {
    const a = pickRelated(0, [c(2, 0.5), c(1, 0.5)], now)
    const b = pickRelated(0, [c(1, 0.5), c(2, 0.5)], now)
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id))
  })
})
