import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'
import type { PlacementTile } from '@/lib/placements/tiles'

import { OrderedSections, type Drawn } from './RenderSections'
import type { SectionBlockEntry, SectionContext } from './types'

// The page-level work a page set can ask of its sections: nobody shows a story twice, and the layout (not an editor) draws the sponsor places.

const media = (id: number): Media => ({ id, alt: 'Tile', url: `/media/tile-${id}.png`, width: 880, height: 704, updatedAt: '2026-11-18T00:00:00.000Z', createdAt: '2026-11-18T00:00:00.000Z' }) as Media
const tile = (key: string): PlacementTile<Media> => ({ key, kind: 'sponsor', label: 'Sponsor message', sponsor: 'Acme', name: `Tile ${key}`, href: 'https://acme.example/', rel: 'sponsored noopener noreferrer', image: media(1), phoneImage: null })
const slots = (rail: number, extra: Partial<NonNullable<SectionContext['slots']>> = {}): NonNullable<SectionContext['slots']> => ({ top: null, rail: Array.from({ length: rail }, (_, i) => tile(`home.rail.${i + 1}`)), fillers: [], band: null, ...extra })

const kind = (label: string, claim?: { candidates: number[]; take: number; pinned?: number[] }, anchor = false): SectionBlockEntry => ({
  dir: label,
  block: { slug: `section${label}`, fields: [] },
  // Prints what the page's pass gave it, so the order and the answer are visible in the markup.
  Component: ({ block, context }: { block: { id?: string }; context: SectionContext }) => createElement('section', { 'data-name': label }, `${label}:${(context.claims?.get(block.id ?? '') ?? []).join(',')}`),
  claimRequest: claim ? async () => claim : undefined,
  anchor,
})
const drawn = (items: Array<[string, SectionBlockEntry]>): Drawn[] => items.map(([key, entry]) => ({ block: { blockType: entry.block.slug, id: key }, key, entry }))
const render = async (d: Drawn[], context: Partial<SectionContext>) => renderToStaticMarkup((await OrderedSections({ drawn: d, context: { themeId: 'wuwf', setId: 'home', draft: false, pageId: 1, ...context } })) as never)

describe('the ordered pass (no story twice)', () => {
  const page = drawn([
    ['lead', kind('Lead', { candidates: [], take: 3, pinned: [1, 2, 3] })],
    ['a', kind('A', { candidates: [1, 2, 4, 5, 6], take: 2 }, true)],
    ['b', kind('B', { candidates: [4, 5, 6, 7, 8], take: 2 }, true)],
  ])
  it('hands each section the stories nothing above took, in the page\'s order', async () => {
    const out = await render(page, {})
    expect(out).toContain('Lead:1,2,3')
    expect(out).toContain('A:4,5')
    expect(out).toContain('B:6,7')
  })
  it('is not run for a page set that does not ask for it', async () => {
    const out = await render(page, { setId: 'sponsor' })
    expect(out).toContain('Lead:<')
    expect(out).toContain('A:<')
  })
})

describe('the sponsor slots', () => {
  const news = drawn([
    ['lead', kind('Lead')],
    ['a', kind('A', undefined, true)],
    ['b', kind('B', undefined, true)],
  ])
  it('puts a row of three above each news run, after the lead', async () => {
    const out = await render(news, { slots: slots(6) })
    expect(out.indexOf('Lead:')).toBeLessThan(out.indexOf('home.rail.1"'))
    expect(out.indexOf('home.rail.1"')).toBeLessThan(out.indexOf('A:'))
    expect(out.indexOf('A:')).toBeLessThan(out.indexOf('home.rail.4"'))
    expect(out.indexOf('home.rail.4"')).toBeLessThan(out.indexOf('B:'))
  })
  it('draws every tile that runs, whatever the layout: rows past the last run follow it', async () => {
    const out = await render(news, { slots: slots(9) })
    for (let i = 1; i <= 9; i++) expect(out, `home.rail.${i}`).toContain(`data-placement="home.rail.${i}"`)
    expect(out.indexOf('B:')).toBeLessThan(out.indexOf('home.rail.7"'))
  })
  it('puts the band after the last run and its leftover rows', async () => {
    const out = await render(news, { slots: slots(9, { band: tile('home.band.1') }) })
    expect(out.indexOf('home.rail.9"')).toBeLessThan(out.indexOf('home.band.1'))
    expect(out.indexOf('B:')).toBeLessThan(out.indexOf('home.band.1'))
  })
  it('puts the top unit once, ordered by the screen: first on a wide screen, after the first section on a phone', async () => {
    const out = await render(news, { slots: slots(0, { top: tile('home.top.1') }) })
    expect(out.match(/data-placement="home\.top\.1"/g)).toHaveLength(1)
    expect(out.indexOf('Lead:')).toBeLessThan(out.indexOf('home.top.1'))
    expect(out).toContain('md:order-1')
    expect(out).toContain('order-1 md:order-2')
  })
  it('leaves the top unit to a block that lays it out itself, and places it only when none does', async () => {
    const owner: Drawn[] = drawn([['lead', { ...kind('Lead'), drawsTop: true }], ['a', kind('A', undefined, true)]])
    const out = await render(owner, { slots: slots(0, { top: tile('home.top.1') }) })
    expect(out).not.toContain('home.top.1')
    expect(out).not.toContain('md:order-1')
  })
  it('shows every row after the content when the page has no news run', async () => {
    const out = await render(drawn([['lead', kind('Lead')]]), { slots: slots(3, { band: tile('home.band.1') }) })
    expect(out.indexOf('Lead:')).toBeLessThan(out.indexOf('home.rail.1"'))
    expect(out).toContain('home.band.1')
  })
  it('draws no slot for a page set that does not allow placements, or when the route loaded no tiles', async () => {
    expect(await render(news, { setId: 'giving', slots: slots(6) })).not.toContain('data-placement')
    expect(await render(news, {})).not.toContain('data-placement')
  })
})
