import { describe, expect, it } from 'vitest'

import { monthYear, statsLine } from './stats'

describe('statsLine', () => {
  it('says what has been made and since when', () => {
    expect(statsLine({ stories: 14, episodes: 3, videos: 9 }, '2026-07-01')).toBe('14 stories · 3 podcast episodes · 9 videos · since July 2026')
  })
  it('uses the singular, and leaves out a kind with none', () => {
    expect(statsLine({ stories: 1, episodes: 0, videos: 1 }, '2026-07-01T00:00:00.000Z')).toBe('1 story · 1 video · since July 2026')
  })
  it('is null when there is nothing to say, and still gives the date when there is no work yet', () => {
    expect(statsLine({ stories: 0, episodes: 0, videos: 0 }, null)).toBeNull()
    expect(statsLine({ stories: 0, episodes: 0, videos: 0 }, '2026-07-01')).toBe('since July 2026')
  })
})

describe('monthYear', () => {
  it('reads the day the date names, whatever the time zone', () => {
    expect(monthYear('2026-07-01T00:00:00.000Z')).toBe('July 2026')
    expect(monthYear('2026-12-31')).toBe('December 2026')
  })
  it('is null for anything that is not a date', () => {
    for (const v of ['', 'soon', '2026-13-01', '26-07-01']) expect(monthYear(v)).toBeNull()
  })
})
