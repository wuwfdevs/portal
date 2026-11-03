import { describe, expect, it } from 'vitest'

import { PAGE_SIZE, buildCalendar, calendarHref, parseCalendarQuery, windowOf, type CalendarEvent, type CalendarQuery } from './calendar'
import type { Schedule } from './schedule'

// "Now" is Tuesday 2026-11-03, noon in Pensacola.
const NOW = new Date('2026-11-03T18:00:00Z')
const MUSIC = { slug: 'music-classical', title: 'Music: Classical' }
const THEATER = { slug: 'theater', title: 'Theater' }
const OUTDOORS = { slug: 'outdoors', title: 'Outdoors' }

const ev = (id: number, title: string, schedule: Schedule, categories = [MUSIC], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  path: `/community-calendar/event/e${id}`,
  title,
  teaser: null,
  categories,
  schedule,
  venueName: null,
  city: null,
  organizer: null,
  price: null,
  free: false,
  ...extra,
})
const once = (date: string, start: string, end: string | null = null): Schedule => ({ kind: 'once', date, start, end })

const A = ev(1, 'Morning Talk', once('2026-11-03', '09:00', '10:00'))
const B = ev(2, 'Evening Concert', once('2026-11-03', '19:00', '20:00'))
const C = ev(3, 'Side Show', { kind: 'daily', startDate: '2026-11-02', endDate: '2026-11-08', start: '19:30', end: '21:30' }, [THEATER])
const D = ev(4, 'Palafox Market', { kind: 'weekly', startDate: '2026-11-07', endDate: '2026-12-05', everyWeeks: 1, slots: [{ day: 6, start: '09:00', end: '14:00' }] }, [OUTDOORS], { venueName: 'Downtown Plaza', city: 'Pensacola' })
const E = ev(5, 'Recital', once('2026-11-20', '18:00'), [THEATER, MUSIC], { organizer: 'Café Müller Society' })
const F = ev(6, 'Long Ago', once('2026-10-01', '18:00'))
const G = ev(7, 'Dates Unreadable', { kind: 'listed' })
const ALL = [A, B, C, D, E, F, G]

const q = (over: Partial<CalendarQuery> = {}): CalendarQuery => ({ categories: [], from: null, to: null, q: '', page: 1, ...over })
const titles = (r: ReturnType<typeof buildCalendar>) => r.days.flatMap((d) => d.entries.map((e) => `${e.date} ${e.event.title}`))

describe('what is coming up (no dates picked)', () => {
  const r = buildCalendar(ALL, q(), NOW)
  it('lists each event once at its next date, soonest first, and leaves out what is over or has no dates', () => {
    expect(titles(r)).toEqual(['2026-11-03 Evening Concert', '2026-11-03 Side Show', '2026-11-07 Palafox Market', '2026-11-20 Recital'])
    expect(r.expanded).toBe(false)
    expect(r.total).toBe(4)
  })
  it('an event earlier today that has finished is not listed; one later today is', () => {
    expect(titles(r).join()).not.toMatch(/Morning Talk/)
    expect(titles(r).join()).toMatch(/Evening Concert/)
  })
  it('a recurring event says how it repeats and how many later dates there are', () => {
    const side = r.days.flatMap((d) => d.entries).find((e) => e.event.title === 'Side Show')!
    expect(side.repeats).toBe('Every day, 7:30 PM – 9:30 PM, Nov 2, 2026 through Nov 8, 2026')
    expect(side.more).toBe(5) // Nov 4 to Nov 8
    const market = r.days.flatMap((d) => d.entries).find((e) => e.event.title === 'Palafox Market')!
    expect(market.more).toBe(4)
    const concert = r.days.flatMap((d) => d.entries).find((e) => e.event.title === 'Evening Concert')!
    expect(concert.repeats).toBeNull()
    expect(concert.more).toBe(0)
  })
  it('groups entries under their day', () => {
    expect(r.days.map((d) => [d.date, d.entries.length])).toEqual([['2026-11-03', 2], ['2026-11-07', 1], ['2026-11-20', 1]])
  })
  it('counts categories with every other filter applied, so a filter shows what choosing another would give', () => {
    expect(r.categoryCounts).toEqual({ 'music-classical': 2, theater: 2, outdoors: 1 })
    const filtered = buildCalendar(ALL, q({ categories: ['theater'] }), NOW)
    expect(titles(filtered)).toEqual(['2026-11-03 Side Show', '2026-11-20 Recital'])
    expect(filtered.categoryCounts).toEqual(r.categoryCounts)
    expect(filtered.total).toBe(2)
  })
  it('two categories means either', () => {
    expect(buildCalendar(ALL, q({ categories: ['outdoors', 'theater'] }), NOW).total).toBe(3)
  })
})

describe('what is on (dates picked)', () => {
  it('lists every occurrence in the range, day by day', () => {
    const r = buildCalendar(ALL, q({ from: '2026-11-03', to: '2026-11-08' }), NOW)
    expect(r.expanded).toBe(true)
    expect(titles(r)).toEqual([
      '2026-11-03 Evening Concert',
      '2026-11-03 Side Show',
      '2026-11-04 Side Show',
      '2026-11-05 Side Show',
      '2026-11-06 Side Show',
      '2026-11-07 Palafox Market', // 9:00 AM, before the 7:30 PM play
      '2026-11-07 Side Show',
      '2026-11-08 Side Show',
    ])
    expect(r.days.flatMap((d) => d.entries).every((e) => e.repeats === null && e.more === 0)).toBe(true)
  })
  it('one picked day', () => {
    expect(titles(buildCalendar(ALL, q({ from: '2026-11-20', to: '2026-11-20' }), NOW))).toEqual(['2026-11-20 Recital'])
  })
  it('a range in the past shows what was on, when the events are supplied', () => {
    expect(titles(buildCalendar(ALL, q({ from: '2026-10-01', to: '2026-10-31' }), NOW))).toEqual(['2026-10-01 Long Ago'])
  })
  it('only "to" reads from today', () => {
    expect(buildCalendar(ALL, q({ to: '2026-11-04' }), NOW).window).toEqual({ from: '2026-11-03', to: '2026-11-04' })
  })
})

describe('keyword', () => {
  it('matches title, venue, city, organizer and category, ignoring case and accents, all words required', () => {
    const t = (word: string) => titles(buildCalendar(ALL, q({ q: word }), NOW))
    expect(t('SIDE')).toEqual(['2026-11-03 Side Show'])
    expect(t('plaza')).toEqual(['2026-11-07 Palafox Market'])
    expect(t('pensacola market')).toEqual(['2026-11-07 Palafox Market'])
    expect(t('cafe muller')).toEqual(['2026-11-20 Recital'])
    expect(t('theater')).toEqual(['2026-11-03 Side Show', '2026-11-20 Recital'])
    expect(t('side market')).toEqual([])
  })
})

describe('paging', () => {
  const many = Array.from({ length: 30 }, (_, i) => ev(100 + i, `Event ${String(i).padStart(2, '0')}`, once('2026-12-01', '10:00')))
  it('12 entries a page, and the page number is held inside the real range', () => {
    const p1 = buildCalendar(many, q(), NOW)
    expect(p1.totalPages).toBe(3)
    expect(p1.days.flatMap((d) => d.entries)).toHaveLength(PAGE_SIZE)
    expect(buildCalendar(many, q({ page: 3 }), NOW).days.flatMap((d) => d.entries)).toHaveLength(6)
    expect(buildCalendar(many, q({ page: 99 }), NOW).page).toBe(3)
  })
  it('a day can continue onto the next page without repeating or losing an entry', () => {
    const seen = [1, 2, 3].flatMap((page) => buildCalendar(many, q({ page }), NOW).days.flatMap((d) => d.entries.map((e) => e.event.id)))
    expect(new Set(seen).size).toBe(30)
  })
  it('an empty calendar is one empty page', () => {
    const r = buildCalendar([], q(), NOW)
    expect([r.total, r.totalPages, r.page, r.days.length]).toEqual([0, 1, 1, 0])
  })
})

describe('the request', () => {
  const known = [{ slug: 'theater', groveId: 'grove-theater' }, { slug: 'outdoors', groveId: 'grove-outdoors' }]
  it('reads slugs, Grove ids (the old filter addresses), dates, keyword and page', () => {
    expect(parseCalendarQuery({ category: ['theater', 'nope'], f0: 'grove-outdoors', from: '2026-11-03', to: '2026-11-30', q: '  jazz  night ', page: '3' }, known)).toEqual({
      categories: ['theater', 'outdoors'],
      from: '2026-11-03',
      to: '2026-11-30',
      q: 'jazz night',
      page: 3,
    })
  })
  it('drops what it does not understand instead of throwing', () => {
    const r = parseCalendarQuery({ category: '<script>', f0: 'x', from: '2026-02-30', to: 'tomorrow', q: 'a\u0000b'.padEnd(500, 'z'), page: '-4' }, known)
    expect(r).toMatchObject({ categories: [], from: null, to: null, page: 1 })
    expect(r.q.length).toBeLessThanOrEqual(80)
    expect(r.q).not.toContain('\u0000')
    expect(parseCalendarQuery({ page: '99999999' }, known).page).toBe(500)
    expect(parseCalendarQuery({ page: '2.5' }, known).page).toBe(1)
  })
  it('puts swapped dates in order', () => {
    expect(parseCalendarQuery({ from: '2026-12-01', to: '2026-11-01' }, known)).toMatchObject({ from: '2026-11-01', to: '2026-12-01' })
  })
  it('windows and addresses', () => {
    expect(windowOf({ from: null, to: null }, '2026-11-03')).toEqual({ from: '2026-11-03', to: '2027-11-03' })
    expect(calendarHref({})).toBe('/community-calendar')
    expect(calendarHref({ categories: ['theater', 'outdoors'], from: '2026-11-03', q: 'jazz', page: 2 })).toBe('/community-calendar?category=theater&category=outdoors&from=2026-11-03&q=jazz&page=2')
    expect(calendarHref({ categories: ['theater'], page: 4 }, 1)).toBe('/community-calendar?category=theater')
  })
})
