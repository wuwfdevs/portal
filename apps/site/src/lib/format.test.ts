import { describe, expect, it } from 'vitest'

import { formatDuration, formatLongDate, initialsOf } from './format'

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

describe('formatDuration', () => {
  it('shows minutes and seconds, adding hours only when there are some', () => {
    expect(formatDuration(247)).toBe('4:07')
    expect(formatDuration(59)).toBe('0:59')
    expect(formatDuration(3729)).toBe('1:02:09')
  })
  it('rounds to the nearest second', () => {
    expect(formatDuration(59.6)).toBe('1:00')
  })
  it('is empty for nothing, zero, negative or nonsense', () => {
    for (const v of [null, undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) expect(formatDuration(v)).toBe('')
  })
})
