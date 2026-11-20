import { describe, expect, it } from 'vitest'

import { byRunOrder, describeTarget, isFiller, matchesPage, resolveFillers, resolveZone, stillRunning, type PageContext, type PlacementRecord } from './resolve'

const image = { id: 1, url: '/media/a.png' }
const NOW = new Date('2026-11-18T18:00:00Z')
let n = 0
const rec = (over: Partial<PlacementRecord<{ url: string }>> = {}): PlacementRecord<{ url: string }> => ({
  id: ++n,
  zone: 'list.rail',
  kind: 'sponsor',
  sponsor: 'Acme',
  enabled: true,
  href: 'https://acme.example/',
  alt: 'Acme',
  image,
  order: 100,
  createdAt: '2026-11-01T00:00:00.000Z',
  scope: 'chosen',
  ...over,
})
const section = (id: number | null): PageContext => ({ page: 'list', kind: 'section', id })
const names = (tiles: { sponsor: string | null }[]) => tiles.map((t) => t.sponsor)

describe('matchesPage', () => {
  it('aims a chosen placement only at the sections, topics and reporters it names', () => {
    const r = rec({ sections: [3, { id: 4 }], topics: ['9'], people: [12] })
    expect(matchesPage(r, section(3))).toBe(true)
    expect(matchesPage(r, section(4))).toBe(true)
    expect(matchesPage(r, section(5))).toBe(false)
    expect(matchesPage(r, { page: 'list', kind: 'topic', id: 9 })).toBe(true)
    expect(matchesPage(r, { page: 'list', kind: 'topic', id: 3 })).toBe(false) // a topic with a section's id is not that section
    expect(matchesPage(r, { page: 'list', kind: 'person', id: 12 })).toBe(true)
  })
  it('treats the all-stories page as its own choice', () => {
    expect(matchesPage(rec({ sections: [3] }), { page: 'list', kind: 'latest', id: null })).toBe(false)
    expect(matchesPage(rec({ includeLatest: true }), { page: 'list', kind: 'latest', id: null })).toBe(true)
    expect(matchesPage(rec({ includeLatest: true }), section(3))).toBe(false)
  })
  it('shows "every page" on every list page, and a chosen placement with nothing chosen nowhere', () => {
    expect(matchesPage(rec({ scope: 'all' }), section(77))).toBe(true)
    expect(matchesPage(rec({ scope: 'all' }), { page: 'list', kind: 'latest', id: null })).toBe(true)
    expect(matchesPage(rec({ scope: 'chosen' }), section(3))).toBe(false)
    expect(matchesPage(rec({ scope: null }), section(3))).toBe(false)
  })
  it('does not match a page with no id', () => {
    expect(matchesPage(rec({ sections: [3] }), section(null))).toBe(false)
  })
})

describe('resolveZone', () => {
  it('runs the placements aimed at this page, and not the others', () => {
    const records = [rec({ sponsor: 'Local', sections: [3] }), rec({ sponsor: 'Arts', sections: [4] }), rec({ sponsor: 'Everywhere', scope: 'all' })]
    expect(names(resolveZone('list.rail', section(3), records, NOW))).toEqual(['Local', 'Everywhere'])
    expect(names(resolveZone('list.rail', section(4), records, NOW))).toEqual(['Arts', 'Everywhere'])
    expect(names(resolveZone('list.rail', section(99), records, NOW))).toEqual(['Everywhere'])
  })
  it('runs them in order, lower first, then the one made first', () => {
    const records = [
      rec({ sponsor: 'C', scope: 'all', order: 50, createdAt: '2026-11-03T00:00:00.000Z' }),
      rec({ sponsor: 'B', scope: 'all', order: 50, createdAt: '2026-11-02T00:00:00.000Z' }),
      rec({ sponsor: 'A', scope: 'all', order: 10 }),
      rec({ sponsor: 'D', scope: 'all', order: null, createdAt: '2026-11-01T00:00:00.000Z' }), // no order: 100
    ]
    expect(names(resolveZone('list.rail', section(1), records, NOW))).toEqual(['A', 'B', 'C', 'D'])
  })
  it('gives the same answer however the records arrive', () => {
    const records = ['A', 'B', 'C'].map((s, i) => rec({ sponsor: s, scope: 'all', order: 10 * (i + 1) }))
    expect(names(resolveZone('list.rail', section(1), [...records].reverse(), NOW))).toEqual(['A', 'B', 'C'])
  })
  it('stops at the zone\'s capacity, keeping the first in order', () => {
    const records = Array.from({ length: 7 }, (_, i) => rec({ sponsor: `S${i}`, scope: 'all', order: i }))
    expect(names(resolveZone('list.rail', section(1), records, NOW))).toEqual(['S0', 'S1', 'S2', 'S3']) // four on a list page
  })
  it('leaves out what is switched off, ended, not begun, without a picture or with an unsafe link, without using up a place', () => {
    const records = [
      rec({ sponsor: 'off', scope: 'all', order: 1, enabled: false }),
      rec({ sponsor: 'ended', scope: 'all', order: 2, runUntil: '2026-11-01' }),
      rec({ sponsor: 'later', scope: 'all', order: 3, runFrom: '2027-01-01' }),
      rec({ sponsor: 'bare', scope: 'all', order: 4, image: null }),
      rec({ sponsor: 'bad', scope: 'all', order: 5, href: 'javascript:alert(1)' }),
      ...['a', 'b', 'c', 'd'].map((s, i) => rec({ sponsor: s, scope: 'all', order: 10 + i })),
    ]
    expect(names(resolveZone('list.rail', section(1), records, NOW))).toEqual(['a', 'b', 'c', 'd'])
  })
  it('keys each tile by its zone and its place among those that run', () => {
    const tiles = resolveZone('list.rail', section(3), [rec({ sections: [3] }), rec({ scope: 'all' })], NOW)
    expect(tiles.map((t) => t.key)).toEqual(['list.rail.1', 'list.rail.2'])
  })
  it('ignores targets in a zone on the home page, which has none', () => {
    const records = [rec({ zone: 'home.rail', scope: 'chosen', sponsor: 'Home' }), rec({ zone: 'list.rail', scope: 'all', sponsor: 'List' })]
    expect(names(resolveZone('home.rail', { page: 'home' }, records, NOW))).toEqual(['Home'])
  })
  it('never runs a zone on the wrong kind of page', () => {
    const records = [rec({ zone: 'home.rail', sponsor: 'Home' }), rec({ zone: 'list.rail', scope: 'all', sponsor: 'List' })]
    expect(resolveZone('home.rail', section(3), records, NOW)).toEqual([])
    expect(resolveZone('list.rail', { page: 'home' }, records, NOW)).toEqual([])
  })
  it('never runs a zone that is designed but not built, whatever is stored', () => {
    expect(resolveZone('story.rail', section(3), [rec({ zone: 'story.rail', scope: 'all' })], NOW)).toEqual([])
  })
  it('runs a placement stored under an unknown zone nowhere', () => {
    expect(resolveZone('list.rail', section(3), [rec({ zone: 'nonsense', scope: 'all' })], NOW)).toEqual([])
  })
  it('is empty for no records', () => {
    expect(resolveZone('list.rail', section(3), null, NOW)).toEqual([])
    expect(resolveZone('home.band', { page: 'home' }, [], NOW)).toEqual([])
  })
})

describe('stillRunning', () => {
  it('counts a placement that is on and has not ended, through its last day', () => {
    expect(stillRunning({ enabled: true, runUntil: null }, NOW)).toBe(true)
    expect(stillRunning({ enabled: true, runUntil: '2026-11-18T12:00:00.000Z' }, NOW)).toBe(true)
    expect(stillRunning({ enabled: true, runUntil: '2026-11-17T12:00:00.000Z' }, NOW)).toBe(false)
    expect(stillRunning({ enabled: false, runUntil: null }, NOW)).toBe(false)
  })
})

describe('byRunOrder and describeTarget', () => {
  it('orders by order, then age', () => {
    expect([rec({ order: 5 }), rec({ order: 1 })].sort(byRunOrder).map((r) => r.order)).toEqual([1, 5])
  })
  it('says where a placement is aimed, without looking anything up', () => {
    expect(describeTarget(rec({ zone: 'home.rail' }))).toBe('Home page rail')
    expect(describeTarget(rec({ scope: 'all' }))).toMatch(/every page$/)
    expect(describeTarget(rec({ sections: [1, 2], topics: [3], includeLatest: true }))).toMatch(/2 sections, 1 topic, all stories$/)
    expect(describeTarget(rec({ scope: 'chosen' }))).toMatch(/nothing chosen yet$/)
    expect(describeTarget(rec({ zone: null }))).toBe('No zone chosen')
  })
})

describe('gap fillers', () => {
  const filler = (over: Partial<PlacementRecord<{ url: string }>> = {}) => rec({ zone: 'home.rail', kind: 'house', sponsor: null, fillsGaps: true, ...over })
  const home: PageContext = { page: 'home' }

  it('are held apart from the rail: a filler is never one of the rail\'s own tiles, and never takes a sponsor\'s place or the rail\'s capacity', () => {
    const sponsors = Array.from({ length: 10 }, (_, i) => rec({ zone: 'home.rail', sponsor: `S${i}`, order: i + 10 }))
    const records = [filler({ order: 1 }), ...sponsors]
    expect(names(resolveZone('home.rail', home, records, NOW))).toEqual(sponsors.map((_, i) => `S${i}`))
  })
  it('are the house promotions in the home rail marked as able to fill a gap, in order, with their own keys', () => {
    const records = [filler({ order: 5, alt: 'B' }), filler({ order: 1, alt: 'A' }), rec({ zone: 'home.rail', alt: 'sponsor' })]
    const tiles = resolveFillers(records, NOW)
    expect(tiles.map((t) => t.name)).toEqual(['A', 'B'])
    expect(tiles.map((t) => t.key)).toEqual(['home.rail.fill.1', 'home.rail.fill.2'])
  })
  it('need to be a house promotion in the home rail: a sponsor, or one elsewhere, marked by mistake is not a filler', () => {
    expect(isFiller(filler())).toBe(true)
    expect(isFiller(filler({ kind: 'sponsor' }))).toBe(false)
    expect(isFiller(filler({ zone: 'list.rail' }))).toBe(false)
    expect(isFiller(filler({ fillsGaps: false }))).toBe(false)
    expect(isFiller(filler({ fillsGaps: null }))).toBe(false)
    expect(resolveFillers([filler({ kind: 'sponsor' }), filler({ zone: 'home.band' })], NOW)).toEqual([])
    // Marked by mistake, a sponsor is a sponsor: it runs in the rail like any other and is never held back as a filler.
    expect(names(resolveZone('home.rail', home, [filler({ kind: 'sponsor', sponsor: 'Paid' })], NOW))).toEqual(['Paid'])
  })
  it('follow the same rules as any tile: switched off, ended, without a picture or with an unsafe link, they are left out', () => {
    const records = [filler({ enabled: false }), filler({ runUntil: '2026-11-01' }), filler({ image: null }), filler({ href: 'javascript:alert(1)' }), filler({ alt: 'ok' })]
    expect(resolveFillers(records, NOW).map((t) => t.name)).toEqual(['ok'])
  })
  it('are never more than a row can need, and are empty when there are none', () => {
    expect(resolveFillers(Array.from({ length: 6 }, (_, i) => filler({ order: i })), NOW)).toHaveLength(2)
    expect(resolveFillers([], NOW)).toEqual([])
    expect(resolveFillers(null, NOW)).toEqual([])
  })
})
