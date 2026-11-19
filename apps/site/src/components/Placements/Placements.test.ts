import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'
import type { PlacementTile } from '@/lib/placements/tiles'

import { HomeBand, HomeRail, ListRail } from './index'

const media = (id: number): Media => ({ id, alt: 'Tile', url: `/media/tile-${id}.png`, width: 880, height: 704, updatedAt: '2026-11-18T00:00:00.000Z', createdAt: '2026-11-18T00:00:00.000Z' }) as Media
const tile = (over: Partial<PlacementTile<Media>> = {}): PlacementTile<Media> => ({
  key: 'home.rail.1',
  kind: 'sponsor',
  label: 'Sponsor message',
  sponsor: 'Acme',
  name: 'Acme: tickets',
  href: 'https://acme.example/',
  rel: 'sponsored noopener noreferrer',
  image: media(1),
  phoneImage: null,
  ...over,
})
const rail = (tiles: PlacementTile<Media>[]) => renderToStaticMarkup(React.createElement(HomeRail, { tiles }))
const band = (t: PlacementTile<Media> | null) => renderToStaticMarkup(React.createElement(HomeBand, { tile: t }))

describe('the home page rail', () => {
  it('draws nothing at all when nothing runs, so no empty box is left', () => {
    expect(rail([])).toBe('')
  })
  it('labels a sponsor tile "Sponsor message", links it out as sponsored with no referrer, and names the link by what the artwork says', () => {
    const html = rail([tile()])
    expect(html).toContain('Sponsor message')
    expect(html).toContain('href="https://acme.example/"')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toContain('aria-label="Acme: tickets"')
    expect(html).toContain('data-placement="home.rail.1"')
  })
  it('does not label a house promotion, and keeps a link to a page here on this site', () => {
    const html = rail([tile({ kind: 'house', label: null, sponsor: null, href: '/weather', rel: undefined, name: 'Weather', key: 'home.rail.2' })])
    expect(html).not.toContain('Sponsor message')
    expect(html).toContain('href="/weather"')
    expect(html).not.toContain('rel=')
  })
  it('fits each tile\'s box to its own picture, so no blank band is left above or below it, and loads no script or outside frame', () => {
    const wide = { ...media(2), width: 1000, height: 400 } as Media
    const tall = { ...media(3), width: 600, height: 900 } as Media
    const html = rail([tile(), tile({ key: 'home.rail.2', image: wide }), tile({ key: 'home.rail.3', image: tall })])
    expect(html.match(/aspect-ratio:\s*880 \/ 704/g)).toHaveLength(1)
    expect(html).toMatch(/aspect-ratio:\s*1000 \/ 400/)
    expect(html).toMatch(/aspect-ratio:\s*600 \/ 900/)
    expect(html).not.toMatch(/<script|<iframe|<audio|<video/i)
  })
  it('falls back to the zone\'s recommended shape for a picture whose size is not recorded', () => {
    const unsized = { ...media(4), width: null, height: null } as Media
    expect(rail([tile({ image: unsized })])).toMatch(/aspect-ratio:\s*880 \/ 704/)
  })
  it('is a labeled region listing each tile once', () => {
    const html = rail([tile(), tile({ key: 'home.rail.2', image: media(2) })])
    expect(html).toContain('aria-label="Sponsors and promotions"')
    expect(html.match(/<li /g)).toHaveLength(2)
  })
})

describe('the list pages rail', () => {
  it('draws nothing when nothing is aimed at the page', () => {
    expect(renderToStaticMarkup(React.createElement(ListRail, { tiles: [] }))).toBe('')
  })
  it('is the same labeled, sponsored, script-free rail, in its own zone', () => {
    const html = renderToStaticMarkup(React.createElement(ListRail, { tiles: [tile({ key: 'list.rail.1' })] }))
    expect(html).toContain('data-placement="list.rail"')
    expect(html).toContain('data-placement="list.rail.1"')
    expect(html).toContain('Sponsor message')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).not.toMatch(/<script|<iframe/i)
  })
})

describe('the home page banner', () => {
  it('draws nothing without a banner', () => {
    expect(band(null)).toBe('')
  })
  it('is one labeled, sponsored link in a band no taller than a sixth of its width', () => {
    const html = band(tile({ key: 'home.band.1', image: media(3) }))
    expect(html).toContain('Sponsor message')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toMatch(/aspect-ratio:\s*1200 \/ 200/)
    expect(html).not.toMatch(/<script|<iframe/i)
  })
  it('gives phones their own picture when there is one, and the wide picture alone when there is not', () => {
    const without = band(tile({ key: 'home.band.1' }))
    expect(without).not.toContain('md:hidden')
    const withPhone = band(tile({ key: 'home.band.1', phoneImage: media(4) }))
    expect(withPhone).toContain('md:hidden')
    expect(withPhone).toMatch(/aspect-ratio:\s*800 \/ 400/)
  })
})
