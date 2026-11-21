import { describe, expect, it } from 'vitest'

import { liveTiles, stationDay, tileAccessibleName, tileLabel, tileRel, withinDates, type TileLike } from './pick'
import { BUILT_ZONES, tileKey, ZONES } from './registry'

const image = { id: 1, url: '/media/a.png' }
const tile = (over: Partial<TileLike> = {}): TileLike => ({ kind: 'sponsor', sponsor: 'Acme', enabled: true, href: 'https://acme.example/', alt: 'Acme', image, ...over })
const noon = (iso: string) => new Date(`${iso}T18:00:00Z`)

describe('stationDay', () => {
  it('is the calendar day in Central time, not in UTC', () => {
    // 9 p.m. Central on the 29th is already the 30th in UTC.
    expect(stationDay(new Date('2026-11-30T03:00:00Z'))).toBe('2026-11-29')
    expect(stationDay(new Date('2026-11-30T18:00:00Z'))).toBe('2026-11-30')
  })
})

describe('withinDates', () => {
  it('runs on both end days, and not outside them', () => {
    const t = { runFrom: '2026-11-10T12:00:00.000Z', runUntil: '2026-11-20T12:00:00.000Z' }
    expect(withinDates(t, '2026-11-09')).toBe(false)
    expect(withinDates(t, '2026-11-10')).toBe(true)
    expect(withinDates(t, '2026-11-20')).toBe(true)
    expect(withinDates(t, '2026-11-21')).toBe(false)
  })
  it('treats an empty end as never ending and an empty start as already begun', () => {
    expect(withinDates({}, '2030-01-01')).toBe(true)
    expect(withinDates({ runFrom: '2026-11-10' }, '2030-01-01')).toBe(true)
    expect(withinDates({ runUntil: '2026-11-10' }, '2026-11-01')).toBe(true)
  })
  it('ignores a value that is not a date rather than hiding the tile', () => {
    expect(withinDates({ runFrom: 'soon', runUntil: '' }, '2026-11-01')).toBe(true)
  })
})

describe('liveTiles', () => {
  const now = noon('2026-11-18')

  it('keeps the order the admin lists them in', () => {
    const out = liveTiles([tile({ sponsor: 'A' }), tile({ sponsor: 'B' }), tile({ sponsor: 'C' })], now, 10)
    expect(out.map((t) => t.sponsor)).toEqual(['A', 'B', 'C'])
  })
  it('leaves out a tile that is switched off, expired, not yet begun, without a picture or without a safe address', () => {
    const out = liveTiles(
      [
        tile({ sponsor: 'ok' }),
        tile({ sponsor: 'off', enabled: false }),
        tile({ sponsor: 'ended', runUntil: '2026-11-17' }),
        tile({ sponsor: 'later', runFrom: '2026-11-19' }),
        tile({ sponsor: 'no picture', image: null }),
        tile({ sponsor: 'bare id', image: 7 }),
        tile({ sponsor: 'no url', image: { id: 2 } }),
        tile({ sponsor: 'script', href: 'javascript:alert(1)' }),
        tile({ sponsor: 'http', href: 'http://insecure.example/' }),
        tile({ sponsor: 'no href', href: '' }),
      ],
      now,
      10,
    )
    expect(out.map((t) => t.sponsor)).toEqual(['ok'])
  })
  it('runs a tile through the whole of its last day at the station', () => {
    const t = tile({ runUntil: '2026-11-18T12:00:00.000Z' })
    expect(liveTiles([t], new Date('2026-11-19T03:30:00Z'), 10)).toHaveLength(1) // 9:30 p.m. Central on the 18th
    expect(liveTiles([t], new Date('2026-11-19T07:00:00Z'), 10)).toHaveLength(0) // 1 a.m. Central on the 19th
  })
  it('takes at most the placement\'s limit, counted among the tiles that run', () => {
    const many = [tile({ enabled: false }), ...Array.from({ length: 12 }, (_, i) => tile({ sponsor: `s${i}` }))]
    expect(liveTiles(many, now, 10)).toHaveLength(10)
    expect(liveTiles(many, now, 10)[0]!.sponsor).toBe('s0')
  })
  it('is empty for nothing', () => {
    expect(liveTiles(null, now, 10)).toEqual([])
    expect(liveTiles(undefined, now, 10)).toEqual([])
    expect(liveTiles([tile()], now, 0)).toEqual([])
  })
  it('accepts a page on this site and a house promotion', () => {
    expect(liveTiles([tile({ kind: 'house', href: '/weather' })], now, 10)).toHaveLength(1)
  })
})

describe('labels and links', () => {
  it('labels a sponsor tile "Sponsor message", a house promotion "From WUWF" (never as a sponsor), and a tile with no kind as a sponsor (the safe way to be wrong)', () => {
    expect(tileLabel({ kind: 'sponsor' })).toBe('Sponsor message')
    expect(tileLabel({ kind: null })).toBe('Sponsor message')
    expect(tileLabel({ kind: 'house' })).toBe('From WUWF')
  })
  it('names the link by what the artwork says, then by the sponsor', () => {
    expect(tileAccessibleName({ alt: ' Acme: 20% off ', sponsor: 'Acme' })).toBe('Acme: 20% off')
    expect(tileAccessibleName({ alt: '', sponsor: 'Acme' })).toBe('Acme')
    expect(tileAccessibleName({})).toBe('Sponsor message')
  })
  it('marks a sponsor link as sponsored, and any link off the site as sending no referrer', () => {
    expect(tileRel({ kind: 'sponsor' }, 'https://acme.example/')).toBe('sponsored noopener noreferrer')
    expect(tileRel({ kind: 'house' }, 'https://protectmypublicmedia.org/')).toBe('noopener noreferrer')
    expect(tileRel({ kind: 'house' }, '/weather')).toBeUndefined()
    expect(tileRel({ kind: 'sponsor' }, '/support')).toBe('sponsored')
  })
})

describe('the zone registry', () => {
  it('names a tile by its zone and its position', () => {
    expect(tileKey('home.rail', 3)).toBe('home.rail.3')
    expect(tileKey('home.band', 0)).toBe('home.band.1')
  })
  it('builds every zone (the story rail was retired and is not a zone): the top units, the home page\'s rail and banner, the list pages\' rail and the story page\'s inline bands', () => {
    expect(BUILT_ZONES.map((z) => z.id).sort()).toEqual(['home.band', 'home.rail', 'home.top', 'list.rail', 'list.top', 'story.inline'])
    expect(Object.keys(ZONES)).not.toContain('story.rail')
  })
  it('holds nine tiles in the home rail (three full rows; owner glide to six, 2026-11-20), four on a list page, one in a band or top unit, and two in a story (the second only in a long one); none is a rotation', () => {
    expect(ZONES['home.rail'].capacity).toBe(9)
    expect(ZONES['list.rail'].capacity).toBe(4)
    for (const z of Object.values(ZONES)) if (z.shape === 'band') expect(z.capacity, z.id).toBe(z.id === 'story.inline' ? 2 : 1)
  })
  it('lets only the zones on pages that have sections, topics or reporters be aimed', () => {
    expect(Object.values(ZONES).filter((z) => z.targetable).map((z) => z.page).every((p) => p !== 'home')).toBe(true)
    expect(ZONES['home.rail'].targetable).toBe(false)
  })
  it('keeps every zone but a top unit to six wide for one tall', () => {
    for (const z of Object.values(ZONES).filter((x) => !x.top)) expect(z.artwork.width / z.artwork.height, z.id).toBeLessThanOrEqual(6)
  })
  it('allows a top unit only as a slim strip: one exclusive unit, eight wide for one tall at most, so it does not push the story down', () => {
    const tops = Object.values(ZONES).filter((z) => z.top)
    expect(tops.map((z) => z.id).sort()).toEqual(['home.top', 'list.top'])
    for (const z of tops) {
      expect(z.capacity, z.id).toBe(1)
      expect(z.exclusive, z.id).toBe(true)
      expect(z.shape, z.id).toBe('band')
      expect(z.artwork.width / z.artwork.height, z.id).toBeLessThanOrEqual(8)
      expect(z.artwork.width / z.artwork.height, z.id).toBeGreaterThanOrEqual(6)
    }
    expect(ZONES['home.top'].targetable).toBe(false)
    expect(ZONES['list.top'].targetable).toBe(true)
  })
})
