import { describe, expect, it } from 'vitest'

import { datesOverlap, describeDates, exclusiveConflicts, targetsOverlap, type BookedPlacement } from './conflicts'

const TODAY = '2026-11-20'
const top = (over: Partial<BookedPlacement> = {}): BookedPlacement => ({ id: 1, name: 'A', zone: 'home.top', enabled: true, runFrom: '2026-12-01', runUntil: '2026-12-07', ...over })

describe('datesOverlap', () => {
  it('shares a day when the ranges touch, either end inclusive', () => {
    expect(datesOverlap({ runFrom: '2026-12-01', runUntil: '2026-12-07' }, { runFrom: '2026-12-07', runUntil: '2026-12-14' })).toBe(true)
    expect(datesOverlap({ runFrom: '2026-12-01', runUntil: '2026-12-07' }, { runFrom: '2026-12-08', runUntil: '2026-12-14' })).toBe(false)
    expect(datesOverlap({ runFrom: '2026-12-08', runUntil: '2026-12-14' }, { runFrom: '2026-12-01', runUntil: '2026-12-07' })).toBe(false)
  })
  it('treats an empty start as already begun and an empty end as never ending', () => {
    expect(datesOverlap({ runFrom: null, runUntil: null }, { runFrom: '2027-01-01', runUntil: '2027-01-07' })).toBe(true)
    expect(datesOverlap({ runFrom: '2026-12-01', runUntil: null }, { runFrom: '2027-06-01', runUntil: null })).toBe(true)
    expect(datesOverlap({ runFrom: null, runUntil: '2026-12-01' }, { runFrom: '2026-12-02', runUntil: null })).toBe(false)
  })
})

describe('exclusiveConflicts: the home top unit', () => {
  it('refuses a second sponsor for dates that overlap, and allows the next week', () => {
    expect(exclusiveConflicts(top({ id: 2, name: 'B', runFrom: '2026-12-05', runUntil: '2026-12-12' }), [top()], TODAY).map((c) => c.name)).toEqual(['A'])
    expect(exclusiveConflicts(top({ id: 2, name: 'B', runFrom: '2026-12-08', runUntil: '2026-12-14' }), [top()], TODAY)).toEqual([])
  })
  it('ignores itself, a switched-off placement, one in another zone, and one that has ended', () => {
    expect(exclusiveConflicts(top(), [top()], TODAY)).toEqual([])
    expect(exclusiveConflicts(top({ id: 2 }), [top({ enabled: false })], TODAY)).toEqual([])
    expect(exclusiveConflicts(top({ id: 2 }), [top({ zone: 'list.top' })], TODAY)).toEqual([])
    expect(exclusiveConflicts(top({ id: 2 }), [top({ runFrom: '2026-10-01', runUntil: '2026-10-07' })], TODAY)).toEqual([])
  })
  it('says nothing for a candidate that is off or already over, and for a zone that is not exclusive', () => {
    expect(exclusiveConflicts(top({ id: 2, enabled: false }), [top()], TODAY)).toEqual([])
    expect(exclusiveConflicts(top({ id: 2, runFrom: '2026-10-01', runUntil: '2026-10-07' }), [top({ runFrom: '2026-10-01', runUntil: '2026-12-30' })], TODAY)).toEqual([])
    expect(exclusiveConflicts({ id: 2, zone: 'home.rail', enabled: true }, [{ id: 1, zone: 'home.rail', enabled: true }], TODAY)).toEqual([])
  })
})

describe('exclusiveConflicts: a section\'s presenting sponsor', () => {
  const sec = (over: Partial<BookedPlacement> = {}): BookedPlacement => ({ id: 1, name: 'A', zone: 'list.top', enabled: true, scope: 'chosen', sections: [3], runFrom: '2026-12-01', runUntil: '2026-12-31', ...over })
  it('refuses a second sponsor for the same section and dates, and allows another section', () => {
    expect(exclusiveConflicts(sec({ id: 2, name: 'B' }), [sec()], TODAY).map((c) => c.name)).toEqual(['A'])
    expect(exclusiveConflicts(sec({ id: 2, sections: [4] }), [sec()], TODAY)).toEqual([])
  })
  it('lets "every page" meet any page, and a topic and a section never clash', () => {
    expect(exclusiveConflicts(sec({ id: 2, scope: 'all', sections: [] }), [sec()], TODAY)).toHaveLength(1)
    expect(exclusiveConflicts(sec({ id: 2, sections: [], topics: [9] }), [sec()], TODAY)).toEqual([])
  })
  it('compares ids whether stored as numbers, strings or populated records', () => {
    expect(targetsOverlap({ sections: [{ id: 3 }] }, { sections: ['3'] })).toBe(true)
    expect(targetsOverlap({ includeLatest: true }, { includeLatest: true })).toBe(true)
    expect(targetsOverlap({ includeLatest: true }, { sections: [1] })).toBe(false)
  })
})

describe('describeDates', () => {
  it('says the range in words', () => {
    expect(describeDates({ runFrom: '2026-12-01', runUntil: '2026-12-07' })).toBe('Dec 1, 2026 to Dec 7, 2026')
    expect(describeDates({ runFrom: '2026-12-01' })).toBe('from Dec 1, 2026')
    expect(describeDates({ runUntil: '2026-12-07' })).toBe('until Dec 7, 2026')
    expect(describeDates({})).toBe('every day')
  })
})
