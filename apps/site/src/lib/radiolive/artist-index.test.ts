import { describe, expect, it } from 'vitest'

import { filterArtists, indexArtists, letterOf, lettersPresent } from './artist-index'

const shows = [
  { slug: 'a', startsAt: '2026-10-02T18:00:00Z', lineup: [{ slug: 'jesse-bumann', name: 'Jesse Bumann' }, { slug: 'zoe-lopez', name: 'Zoë Lopez' }] },
  { slug: 'b', startsAt: '2026-11-06T18:00:00Z', lineup: [{ slug: 'jesse-bumann', name: 'Jesse Bumann' }] },
  { slug: 'c', startsAt: '2026-12-04T18:00:00Z', lineup: [{ slug: 'ann-ames', name: 'Ann Ames' }, { slug: '3-doors', name: '3 Doors Up' }] },
]
const now = new Date('2026-11-23T18:00:00Z')

describe('letterOf', () => {
  it('files a name under its first letter without an accent, and anything else under #', () => {
    expect(letterOf('Zoë Lopez')).toBe('Z')
    expect(letterOf('ann ames')).toBe('A')
    expect(letterOf('"Hot" Rod')).toBe('H')
    expect(letterOf('3 Doors Up')).toBe('#')
    expect(letterOf('')).toBe('#')
  })
})

describe('indexArtists', () => {
  const all = indexArtists(shows, now)
  it('lists every artist of a published show once, A to Z', () => {
    expect(all.map((a) => a.slug)).toEqual(['ann-ames', 'jesse-bumann', 'zoe-lopez', '3-doors'])
  })
  it('counts only shows that are over, and gives a coming artist no line (their page still exists)', () => {
    expect(all.find((a) => a.slug === 'jesse-bumann')!.line).toBe('2 appearances · Nov 6, 2026')
    expect(all.find((a) => a.slug === 'zoe-lopez')!.line).toBe('Oct 2, 2026')
    expect(all.find((a) => a.slug === 'ann-ames')!.line).toBe('')
  })
})

describe('filter', () => {
  const all = indexArtists(shows, now)
  it('keeps everyone with no search and no letter', () => expect(filterArtists(all, '', null)).toHaveLength(4))
  it('finds part of a name, ignoring case and accents', () => {
    expect(filterArtists(all, 'BUM', null).map((a) => a.slug)).toEqual(['jesse-bumann'])
    expect(filterArtists(all, 'zoe', null).map((a) => a.slug)).toEqual(['zoe-lopez'])
  })
  it('keeps one letter, and both together', () => {
    expect(filterArtists(all, '', 'A').map((a) => a.slug)).toEqual(['ann-ames'])
    expect(filterArtists(all, 'es', 'J').map((a) => a.slug)).toEqual(['jesse-bumann'])
    expect(filterArtists(all, 'zz', null)).toEqual([])
  })
  it('lists the letters that have an artist, # last', () => expect(lettersPresent(all)).toEqual(['A', 'J', 'Z', '#']))
})
