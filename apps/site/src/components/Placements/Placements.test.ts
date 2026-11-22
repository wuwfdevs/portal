import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'
import type { RowItem } from '@/lib/placements/flow'
import type { PlacementTile } from '@/lib/placements/tiles'

import { HomeBand, InlineUnit, ListRail, SponsorBand, SponsorRow, TopUnit } from './index'

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
const house = (over: Partial<PlacementTile<Media>> = {}) => tile({ kind: 'house', label: 'From WUWF', sponsor: null, href: '/weather', rel: undefined, name: 'Weather', key: 'home.rail.9', ...over })
const items = (tiles: PlacementTile<Media>[], filler = false): RowItem<PlacementTile<Media>>[] => tiles.map((t) => ({ tile: t, filler }))
const oneRow = (tiles: PlacementTile<Media>[]) => renderToStaticMarkup(React.createElement(SponsorRow, { items: items(tiles) }))
const band = (t: PlacementTile<Media> | null) => renderToStaticMarkup(React.createElement(HomeBand, { tile: t }))
const wide = { ...media(2), width: 1000, height: 400 } as Media

describe('a tile', () => {
  it('draws nothing at all when nothing runs, so no empty box is left', () => {
    expect(oneRow([])).toBe('')
  })
  it('labels a sponsor tile "Sponsor message" with the sponsor\'s name, links it out as sponsored with no referrer, and names the link by what the artwork says', () => {
    const html = oneRow([tile(), tile({ key: 'home.rail.2', image: media(2) })])
    expect(html).toContain('Sponsor message')
    expect(html).toContain('>Acme<')
    expect(html).toContain('href="https://acme.example/"')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toContain('aria-label="Acme: tickets"')
    expect(html).toContain('data-placement="home.rail.1"')
  })
  it('says "From WUWF" on a house promotion, never "Sponsor message", and keeps a link to a page here on this site', () => {
    const html = oneRow([house(), house({ key: 'home.rail.8' })])
    expect(html).toContain('From WUWF')
    expect(html).not.toContain('Sponsor message')
    expect(html).toContain('href="/weather"')
    expect(html).not.toContain('rel=')
  })
  it('gives every tile the same 5:4 frame, whatever shape its picture is, and loads no script or outside frame', () => {
    const tall = { ...media(3), width: 600, height: 900 } as Media
    const html = oneRow([tile({ image: wide }), tile({ key: 'home.rail.2', image: tall })])
    expect(html.match(/aspect-ratio:\s*880 \/ 704/g)).toHaveLength(2)
    expect(html).not.toMatch(/aspect-ratio:\s*1000 \/ 400|aspect-ratio:\s*600 \/ 900/)
    expect(html).not.toMatch(/<script|<iframe|<audio|<video/i)
  })
  it('puts a blurred copy of the picture behind artwork that does not fill the frame, hidden from screen readers, and none behind artwork that does', () => {
    const filled = oneRow([tile(), tile({ key: 'home.rail.2', image: media(2) })])
    expect(filled).not.toContain('blur-2xl')
    const small = oneRow([tile({ image: wide }), tile({ key: 'home.rail.2', image: media(2) })])
    expect(small.match(/blur-2xl/g)).toHaveLength(1)
    expect(small).toMatch(/aria-hidden="true"[^>]*><div><picture[^>]*><img[^>]*blur-2xl/)
    // The picture itself is still shown whole, never cropped.
    expect(small).toContain('object-contain')
  })
  it('puts a blurred copy behind a picture whose size is not recorded, since it may not fill the frame', () => {
    const unsized = { ...media(4), width: null, height: null } as Media
    expect(oneRow([tile({ image: unsized }), tile({ key: 'home.rail.2' })])).toContain('blur-2xl')
  })
  it('is a labeled region listing each tile once', () => {
    const html = oneRow([tile(), tile({ key: 'home.rail.2', image: media(2) })])
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

describe('a row of sponsor tiles', () => {
  const row = (rowItems: RowItem<PlacementTile<Media>>[]) => renderToStaticMarkup(React.createElement(SponsorRow, { items: rowItems }))
  const paid = (n: number) => items(Array.from({ length: n }, (_, i) => tile({ key: `home.rail.${i + 1}`, image: media(i + 10) })))
  const promo = (n: number): RowItem<PlacementTile<Media>> => ({ tile: house({ key: `home.rail.fill.${n}`, image: media(n + 40) }), filler: true })

  it('is a labeled region, full width, with each tile a fixed 22rem so a row of three fills a wide screen and wraps below it', () => {
    const html = row(paid(3))
    expect(html).toContain('aria-label="Sponsors and promotions"')
    expect(html).toContain('flex-wrap')
    expect(html.match(/w-\[22rem\]/g)).toHaveLength(3)
    expect(html).toContain('max-w-full')
  })
  it('centers a short row, so a row of one or two looks deliberate rather than left against an edge', () => {
    expect(row(paid(1))).toContain('justify-center')
    expect(row(paid(2))).toContain('justify-center')
  })
  it('draws every tile it is given, and nothing with none', () => {
    expect(row(paid(3)).match(/<li /g)).toHaveLength(3)
    expect(row([])).toBe('')
  })
  it('labels a sponsor "Sponsor message" and a completing promotion "From WUWF", keyed apart from the rail\'s own tiles', () => {
    const html = row([...paid(1), promo(1), promo(2)])
    expect(html.match(/Sponsor message/g)).toHaveLength(1)
    expect(html.match(/From WUWF/g)).toHaveLength(2)
    expect(html).toContain('data-placement="home.rail.fill.1"')
  })
  it('hides no tile at any width: nothing here is display-none, so a paid tile cannot be held back by a breakpoint', () => {
    expect(row([...paid(1), promo(1)])).not.toMatch(/[" ]hidden [a-z]+:block/)
  })
  it('loads no script or outside frame', () => {
    expect(row(paid(3))).not.toMatch(/<script|<iframe|<audio|<video/i)
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
  it('lays a picture that is not the band\'s shape on a blurred copy of itself, and leaves one that is alone', () => {
    const exact = { ...media(5), width: 1200, height: 200 } as Media
    expect(band(tile({ key: 'home.band.1', image: exact }))).not.toContain('blur-2xl')
    expect(band(tile({ key: 'home.band.1', image: media(6) }))).toContain('blur-2xl')
  })
})

describe('a top unit', () => {
  const top = (t: PlacementTile<Media> | null) => renderToStaticMarkup(React.createElement(TopUnit, { tile: t }))
  it('draws nothing without a tile', () => {
    expect(top(null)).toBe('')
  })
  it('is one labeled, sponsored link in the slim strip shape, with no script or frame', () => {
    const html = top(tile({ key: 'home.top.1', image: media(7) }))
    expect(html).toContain('Sponsor message')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toContain('data-placement="home.top.1"')
    expect(html).toMatch(/aspect-ratio:\s*1600 \/ 200/)
    expect(html).not.toMatch(/<script|<iframe|<video|<audio/i)
  })
  it('gives phones their own picture when there is one', () => {
    expect(top(tile({ key: 'home.top.1' }))).not.toContain('md:hidden')
    const withPhone = top(tile({ key: 'home.top.1', phoneImage: media(8) }))
    expect(withPhone).toContain('md:hidden')
    expect(withPhone).toMatch(/aspect-ratio:\s*640 \/ 200/)
  })
  it('is the width of the page\'s content, not a narrower box', () => {
    expect(top(tile({ key: 'home.top.1' }))).not.toMatch(/max-w-\[/)
  })
  it('says "From WUWF" for a house promotion, never "Sponsor message"', () => {
    const html = top(house({ key: 'home.top.1' }))
    expect(html).toContain('From WUWF')
    expect(html).not.toContain('Sponsor message"')
  })
})

describe('the story page\'s band', () => {
  it('draws the inline band as one labeled, sponsored link kept out of the story\'s prose styling, and nothing without a tile', () => {
    expect(renderToStaticMarkup(React.createElement(InlineUnit, { tile: null }))).toBe('')
    const html = renderToStaticMarkup(React.createElement(InlineUnit, { tile: tile({ key: 'story.inline.1' }) }))
    expect(html).toContain('not-prose')
    expect(html).toContain('data-placement="story.inline.1"')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toMatch(/aspect-ratio:\s*1200 \/ 200/)
    expect(html).not.toMatch(/<script|<iframe/i)
  })
})

describe('a band of sponsor tiles between the news sections', () => {
  const inBand = (tiles: PlacementTile<Media>[]) => renderToStaticMarkup(React.createElement(SponsorBand, { items: items(tiles) }))
  it('draws nothing with no tiles, so no empty tinted strip is left', () => {
    expect(inBand([])).toBe('')
  })
  it('sets the row apart from the reporting: full width, the neutral surface tint, a hairline above and below, the tiles still white cards', () => {
    const html = inBand([tile(), tile({ key: 'home.rail.2', image: media(2) })])
    expect(html).toContain('border-y border-rule bg-surface-2')
    expect(html).toContain('data-sponsor-band')
    expect(html).toContain('bg-surface"')
    expect(html).toContain('aria-label="Sponsors and promotions"')
    expect(html.indexOf('border-y')).toBeLessThan(html.indexOf('container'))
  })
  it('holds the same tiles as the row, with the same labels and links, and never a sponsor\'s own colour', () => {
    const html = inBand([tile()])
    expect(html).toContain('Sponsor message')
    expect(html).toContain('data-placement="home.rail.1"')
    expect(html).not.toMatch(/style="[^"]*background(-color)?:/i)
  })
})
