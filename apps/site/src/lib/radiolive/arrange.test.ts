import { describe, expect, it } from 'vitest'

import { appearanceLine, appearances, centralDay, dateParts, joinNames, performanceTitle, splitPerformances, ticketInfo, type PerformanceLike } from './arrange'

const a = (slug: string) => ({ slug, name: slug.toUpperCase() })
const show = (slug: string, startsAt: string, lineup: string[] = [], title?: string): PerformanceLike => ({ slug, startsAt, title, lineup: lineup.map(a) })

describe('names and titles', () => {
  it('joins one, two and three names', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A & B')
    expect(joinNames([' A ', 'B', 'C'])).toBe('A, B & C')
  })
  it('uses the editor\'s headline, else the lineup', () => {
    expect(performanceTitle(show('x', '2026-12-04T00:00:00Z', ['a', 'b']))).toBe('A & B')
    expect(performanceTitle(show('x', '2026-12-04T00:00:00Z', ['a'], ' Season opener '))).toBe('Season opener')
  })
})

describe('Central time', () => {
  it('reads a late-evening Central show on its Central day, not the UTC one', () => {
    expect(centralDay('2026-12-04T02:30:00Z')).toBe('2026-12-03') // 8:30 p.m. CST on Dec. 3
    expect(dateParts('2026-12-04T00:00:00Z')).toMatchObject({ month: 'Dec', day: '3', weekday: 'Thursday', time: '6 p.m.' })
    expect(dateParts('2026-12-04T00:30:00Z').time).toBe('6:30 p.m.')
  })
})

describe('splitPerformances', () => {
  const list = [show('past-old', '2026-08-08T23:00:00Z'), show('tonight', '2026-12-04T00:00:00Z'), show('future', '2027-01-08T00:00:00Z'), show('past-new', '2026-10-30T00:00:00Z')]
  it('keeps a show upcoming for the whole of its Central day', () => {
    const { upcoming, past } = splitPerformances(list, '2026-12-03T21:00:00Z') // 3 p.m. Central on show day
    expect(upcoming.map((p) => p.slug)).toEqual(['tonight', 'future'])
    expect(past.map((p) => p.slug)).toEqual(['past-new', 'past-old'])
  })
  it('calls it past the next Central day', () => {
    expect(splitPerformances(list, '2026-12-04T07:00:00Z').upcoming.map((p) => p.slug)).toEqual(['future'])
  })
})

describe('ticketInfo', () => {
  it('only offers a button when it has an address', () => {
    expect(ticketInfo('onSale', 'https://tix.example.com/x')).toEqual({ label: 'Get tickets', href: 'https://tix.example.com/x' })
    expect(ticketInfo('onSale', null)).toEqual({ label: 'Tickets on sale', href: null })
    expect(ticketInfo('soldOut', 'https://x.example.com')).toEqual({ label: 'Sold out', href: null })
    expect(ticketInfo('free', null).label).toBe('Free to attend')
    expect(ticketInfo(undefined, null).label).toBe('Tickets on sale soon')
  })
})

describe('appearances', () => {
  const shows = [show('s1', '2026-08-08T23:00:00Z', ['x', 'y']), show('s2', '2026-10-30T00:00:00Z', ['x'])]
  const list = appearances(shows)
  it('counts each artist and finds the last time, most recent first', () => {
    expect(list.map((r) => [r.slug, r.count, r.last])).toEqual([['x', 2, '2026-10-30T00:00:00Z'], ['y', 1, '2026-08-08T23:00:00Z']])
  })
  it('words the line, leaving the count out for one', () => {
    expect(appearanceLine(list[0]!)).toBe('2 appearances · Oct 29, 2026')
    expect(appearanceLine(list[1]!)).toBe('Aug 8, 2026')
  })
})
