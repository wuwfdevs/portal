import { describe, expect, it } from 'vitest'

import { formatLongDate, initialsOf } from './format'

describe('formatLongDate', () => {
  it('formats in the station\'s time zone, so a late-evening story keeps its own day', () => {
    expect(formatLongDate('2026-10-28T12:00:00.000Z')).toBe('Oct 28, 2026')
    // 02:00 UTC on the 29th is still the evening of the 28th in Pensacola (CDT).
    expect(formatLongDate('2026-10-29T02:00:00.000Z')).toBe('Oct 28, 2026')
  })
  it('is empty for nothing or nonsense, never "Invalid Date"', () => {
    expect(formatLongDate(null)).toBe('')
    expect(formatLongDate(undefined)).toBe('')
    expect(formatLongDate('not a date')).toBe('')
  })
})

describe('initialsOf', () => {
  it('takes the first letters of the first two words', () => {
    expect(initialsOf('Leigh Ostrander')).toBe('LO')
    expect(initialsOf('  marisol  tran  ')).toBe('MT')
    expect(initialsOf('Madonna')).toBe('M')
    expect(initialsOf('Ada Byron King')).toBe('AB')
    expect(initialsOf('')).toBe('')
  })
})
