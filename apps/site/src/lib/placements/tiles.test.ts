import { describe, expect, it } from 'vitest'

import { placementTiles, tileRef, type StoredTile } from './tiles'

const NOW = new Date('2026-11-18T18:00:00Z')
const image = { id: 1, url: '/media/a.png', mimeType: 'image/png' }
const stored = (over: Partial<StoredTile<typeof image>> = {}): StoredTile<typeof image> => ({ id: 12, kind: 'sponsor', sponsor: 'Acme', sponsorId: '7', href: 'https://acme.example/', image, ...over })

describe('a tile for analytics', () => {
  it('carries its placement record, its sponsor record and its zone', () => {
    const [t] = placementTiles('list.rail', [stored()], NOW)
    expect(t).toMatchObject({ placementId: '12', sponsorId: '7', zone: 'list.rail', sponsor: 'Acme' })
    expect(tileRef(t!)).toEqual({ placement_id: '12', sponsor_id: '7', zone: 'list.rail', kind: 'sponsor' })
  })
  it('gives a WUWF promotion no sponsor, even when one was chosen', () => {
    const [t] = placementTiles('home.rail', [stored({ kind: 'house', sponsorId: '7' })], NOW)
    expect(tileRef(t!)).toEqual({ placement_id: '12', sponsor_id: null, zone: 'home.rail', kind: 'house' })
  })
  it('has nothing to count against without a record id', () => {
    const [t] = placementTiles('home.rail', [stored({ id: null })], NOW)
    expect(t!.placementId).toBeNull()
    expect(tileRef(t!)).toBeNull()
  })
})
