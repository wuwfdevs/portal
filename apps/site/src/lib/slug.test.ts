import { describe, expect, it } from 'vitest'

import { slugify, uniqueSlug } from './slug'

describe('slugify', () => {
  it('lowercases and joins words with single hyphens', () => {
    expect(slugify('Rebuild, raise or leave?')).toBe('rebuild-raise-or-leave')
    expect(slugify('  Coastal   Futures  ')).toBe('coastal-futures')
  })
  it('spells out ampersands, drops apostrophes and strips accents', () => {
    expect(slugify('Growth & Development')).toBe('growth-and-development')
    expect(slugify('Pensacola’s "best" café')).toBe('pensacolas-best-cafe')
  })
  it('keeps numbers and never starts or ends with a hyphen', () => {
    expect(slugify('2026: What now?!')).toBe('2026-what-now')
    expect(slugify('---x---')).toBe('x')
  })
  it('returns an empty string for nothing usable, so the caller decides the fallback', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('')).toBe('')
  })
  it('caps the length without leaving a trailing hyphen', () => {
    const s = slugify(`${'word '.repeat(40)}`)
    expect(s.length).toBeLessThanOrEqual(80)
    expect(s.endsWith('-')).toBe(false)
  })
})

describe('uniqueSlug', () => {
  const taken = (...used: string[]) => async (s: string) => used.includes(s)
  it('uses the base when it is free', async () => {
    expect(await uniqueSlug('a-story', taken())).toBe('a-story')
  })
  it('appends the first free number', async () => {
    expect(await uniqueSlug('a-story', taken('a-story'))).toBe('a-story-2')
    expect(await uniqueSlug('a-story', taken('a-story', 'a-story-2', 'a-story-3'))).toBe('a-story-4')
  })
  it('falls back to "untitled" for an empty base', async () => {
    expect(await uniqueSlug('', taken())).toBe('untitled')
  })
  it('gives up rather than looping forever', async () => {
    await expect(uniqueSlug('x', async () => true, 5)).rejects.toThrow(/No free slug/)
  })
})
