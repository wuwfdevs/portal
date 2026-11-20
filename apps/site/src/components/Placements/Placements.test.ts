import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'
import type { FootItem } from '@/lib/placements/flow'
import type { PlacementTile } from '@/lib/placements/tiles'

import { HomeBand, HomeFoot, HomePair, ListRail } from './index'

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
const pair = (tiles: PlacementTile<Media>[]) => renderToStaticMarkup(React.createElement(HomePair, { tiles }))
const foot = (items: FootItem<PlacementTile<Media>>[]) => renderToStaticMarkup(React.createElement(HomeFoot, { items }))
const band = (t: PlacementTile<Media> | null) => renderToStaticMarkup(React.createElement(HomeBand, { tile: t }))
const wide = { ...media(2), width: 1000, height: 400 } as Media

describe('a tile', () => {
  it('draws nothing at all when nothing runs, so no empty box is left', () => {
    expect(pair([])).toBe('')
    expect(foot([])).toBe('')
  })
  it('labels a sponsor tile "Sponsor message" with the sponsor\'s name, links it out as sponsored with no referrer, and names the link by what the artwork says', () => {
    const html = pair([tile(), tile({ key: 'home.rail.2', image: media(2) })])
    expect(html).toContain('Sponsor message')
    expect(html).toContain('>Acme<')
    expect(html).toContain('href="https://acme.example/"')
    expect(html).toContain('rel="sponsored noopener noreferrer"')
    expect(html).toContain('aria-label="Acme: tickets"')
    expect(html).toContain('data-placement="home.rail.1"')
  })
  it('says "From WUWF" on a house promotion, never "Sponsor message", and keeps a link to a page here on this site', () => {
    const html = pair([house(), house({ key: 'home.rail.8' })])
    expect(html).toContain('From WUWF')
    expect(html).not.toContain('Sponsor message')
    expect(html).toContain('href="/weather"')
    expect(html).not.toContain('rel=')
  })
  it('gives every tile the same 5:4 frame, whatever shape its picture is, and loads no script or outside frame', () => {
    const tall = { ...media(3), width: 600, height: 900 } as Media
    const html = pair([tile({ image: wide }), tile({ key: 'home.rail.2', image: tall })])
    expect(html.match(/aspect-ratio:\s*880 \/ 704/g)).toHaveLength(2)
    expect(html).not.toMatch(/aspect-ratio:\s*1000 \/ 400|aspect-ratio:\s*600 \/ 900/)
    expect(html).not.toMatch(/<script|<iframe|<audio|<video/i)
  })
  it('puts a blurred copy of the picture behind artwork that does not fill the frame, hidden from screen readers, and none behind artwork that does', () => {
    const filled = pair([tile(), tile({ key: 'home.rail.2', image: media(2) })])
    expect(filled).not.toContain('blur-2xl')
    const small = pair([tile({ image: wide }), tile({ key: 'home.rail.2', image: media(2) })])
    expect(small.match(/blur-2xl/g)).toHaveLength(1)
    expect(small).toMatch(/aria-hidden="true"[^>]*><div><picture[^>]*><img[^>]*blur-2xl/)
    // The picture itself is still shown whole, never cropped.
    expect(small).toContain('object-contain')
  })
  it('puts a blurred copy behind a picture whose size is not recorded, since it may not fill the frame', () => {
    const unsized = { ...media(4), width: null, height: null } as Media
    expect(pair([tile({ image: unsized }), tile({ key: 'home.rail.2' })])).toContain('blur-2xl')
  })
  it('is a labeled region listing each tile once', () => {
    const html = pair([tile(), tile({ key: 'home.rail.2', image: media(2) })])
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

describe('the foot row', () => {
  const paid = (n: number): FootItem<PlacementTile<Media>>[] => Array.from({ length: n }, (_, i) => ({ tile: tile({ key: `home.rail.${i + 5}`, image: media(i + 10) }), filler: false, from: null }))
  const filler = (n: number, from: 'sm' | 'lg'): FootItem<PlacementTile<Media>> => ({ tile: house({ key: `home.rail.fill.${n}`, image: media(n + 40) }), filler: true, from })

  it('is a labeled region with a heading, four across on a wide screen, two on a tablet and one on a phone', () => {
    const html = foot(paid(4))
    expect(html).toContain('More from our sponsors')
    expect(html).toContain('aria-labelledby="more-sponsors-heading"')
    expect(html).toContain('lg:w-[calc((100%-3.75rem)/4)]')
    expect(html).toContain('sm:w-[calc((100%-1.25rem)/2)]')
    expect(html).toContain('w-full')
  })
  it('draws every paid tile it is given, none hidden at any width', () => {
    const html = foot(paid(5))
    expect(html.match(/<li /g)).toHaveLength(5)
    expect(html).not.toMatch(/[" ]hidden [sl][mg]:block/)
  })
  it('centers its rows, so a last row that is short sits in the middle rather than against one edge', () => {
    expect(foot(paid(1))).toContain('justify-center')
  })
  it('shows a promotion that completes a tablet row from a tablet up, and one that only completes a wide row from a wide screen up', () => {
    const html = foot([...paid(1), filler(1, 'sm'), filler(2, 'lg'), filler(3, 'lg')])
    expect(html.match(/[" ]hidden lg:block/g)).toHaveLength(2)
    expect(html.match(/[" ]hidden sm:block/g)).toHaveLength(1)
  })
  it('labels a promotion "From WUWF" and a sponsor "Sponsor message", and never names a sponsor on a promotion', () => {
    const html = foot([...paid(1), filler(1, 'sm')])
    expect(html).toContain('Sponsor message')
    expect(html).toContain('From WUWF')
    expect(html).toContain('data-placement="home.rail.fill.1"')
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
