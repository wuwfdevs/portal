import { describe, expect, it } from 'vitest'

import { apMonth, bylineText, latestRail, mastheadDate, staffRole } from './arrange'

describe('latestRail', () => {
  const stories = [1, 2, 3, 4, 5, 6].map((id) => ({ id }))
  it('leaves out the featured story and keeps the order', () => {
    expect(latestRail(stories, 2, 3).map((s) => s.id)).toEqual([1, 3, 4])
  })
  it('matches ids across number and string, and keeps everything when nothing is featured', () => {
    expect(latestRail(stories, '1', 2).map((s) => s.id)).toEqual([2, 3])
    expect(latestRail(stories, null, 2).map((s) => s.id)).toEqual([1, 2])
  })
  it('copes with a short list and a zero count', () => {
    expect(latestRail([{ id: 1 }], 1, 5)).toEqual([])
    expect(latestRail(stories, null, 0)).toEqual([])
  })
})

describe('staffRole', () => {
  it('prefers the term\'s role, then the title, then nothing', () => {
    expect([staffRole('News editor', 'Reporter'), staffRole('  ', 'Reporter'), staffRole(null, null)]).toEqual(['News editor', 'Reporter', ''])
  })
})

describe('bylineText', () => {
  it('joins names the way a byline reads', () => {
    expect([[], ['A'], ['A', 'B'], ['A', 'B', 'C'], [' A ', '']].map((n) => bylineText(n))).toEqual(['', 'A', 'A and B', 'A, B and C', 'A'])
  })
})

describe('mastheadDate', () => {
  it('prints the date in Central time with an abbreviated month', () => {
    expect(mastheadDate(new Date('2026-10-30T15:00:00Z'))).toBe('Friday, Oct. 30, 2026')
  })
  it('uses the Central day, not the UTC one, late in the evening', () => {
    expect(mastheadDate(new Date('2026-11-01T03:30:00Z'))).toBe('Saturday, Oct. 31, 2026')
  })
  it('writes March to July out in full', () => {
    expect(mastheadDate(new Date('2026-05-04T17:00:00Z'))).toBe('Monday, May 4, 2026')
  })
})

describe('apMonth', () => {
  it('follows AP style', () => {
    expect(['January', 'February', 'March', 'July', 'August', 'September', 'October', 'December'].map(apMonth)).toEqual(['Jan.', 'Feb.', 'March', 'July', 'Aug.', 'Sept.', 'Oct.', 'Dec.'])
  })
})
