import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import type { Media } from '@/payload-types'
import type { PlacementTile } from '@/lib/placements/tiles'

import { OrderedSections, RenderSections, ctaRuns, type Drawn } from './RenderSections'
import type { SectionBlockEntry, SectionContext } from './types'

// The page-level work a page set can ask of its sections: nobody shows a story twice, and the layout (not an editor) draws the sponsor places.

const media = (id: number): Media => ({ id, alt: 'Tile', url: `/media/tile-${id}.png`, width: 880, height: 704, updatedAt: '2026-11-18T00:00:00.000Z', createdAt: '2026-11-18T00:00:00.000Z' }) as Media
const tile = (key: string): PlacementTile<Media> => ({ key, placementId: '1', sponsorId: '7', zone: 'home.rail', kind: 'sponsor', label: 'Sponsor message', sponsor: 'Acme', name: `Tile ${key}`, href: 'https://acme.example/', rel: 'sponsored noopener noreferrer', image: media(1), phoneImage: null })
const slots = (rail: number, extra: Partial<NonNullable<SectionContext['slots']>> = {}): NonNullable<SectionContext['slots']> => ({ top: null, rail: Array.from({ length: rail }, (_, i) => tile(`home.rail.${i + 1}`)), fillers: [], ...extra })

const kind = (label: string, claim?: { candidates: number[]; take: number; pinned?: number[] }, anchor = false): SectionBlockEntry => ({
  dir: label,
  block: { slug: `section${label}`, fields: [] },
  // Prints what the page's pass gave it, so the order and the answer are visible in the markup.
  Component: ({ block, context }: { block: { id?: string }; context: SectionContext }) =>
    createElement('section', { 'data-name': label }, `${label}:${(context.claims?.get(block.id ?? '') ?? []).join(',')}`, context.slots?.top ? createElement('i', { 'data-top-given-to': label }) : null),
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
  it('hands a block with several parts (More by section) a share per part, in order, under its own key and the part', async () => {
    const parts: SectionBlockEntry = {
      dir: 'Parts',
      block: { slug: 'sectionParts', fields: [] },
      Component: ({ block, context }: { block: { id?: string }; context: SectionContext }) =>
        createElement('section', null, `P1:${(context.claims?.get(`${block.id}:1`) ?? []).join(',')} P2:${(context.claims?.get(`${block.id}:2`) ?? []).join(',')}`),
      claimRequest: async () => [
        { part: '1', candidates: [4, 5, 6, 7, 8, 10], take: 2 },
        { part: '2', candidates: [8, 9, 10, 11], take: 2 },
      ],
    }
    const out = await render([...page, ...drawn([['p', parts]])], {})
    // What the runs above took is gone, and the second column does not repeat the first's.
    expect(out).toContain('P1:8,10')
    expect(out).toContain('P2:9,11')
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
    ['c', kind('C', undefined, true)],
    ['tail', kind('Tail')],
  ])
  it('puts a row of three after the first news run and after the third, so the news reads in pairs between bands', async () => {
    const out = await render(news, { slots: slots(6) })
    expect(out.indexOf('A:')).toBeLessThan(out.indexOf('home.rail.1"'))
    expect(out.indexOf('home.rail.3"')).toBeLessThan(out.indexOf('B:'))
    expect(out.indexOf('B:')).toBeLessThan(out.indexOf('C:'))
    expect(out.indexOf('C:')).toBeLessThan(out.indexOf('home.rail.4"'))
    expect(out.indexOf('home.rail.6"')).toBeLessThan(out.indexOf('Tail:'))
    expect(out.match(/data-sponsor-band/g)).toHaveLength(2)
  })
  it('draws every tile that runs, whatever the layout: rows past the last place follow the last run', async () => {
    const out = await render(news, { slots: slots(9) })
    for (let i = 1; i <= 9; i++) expect(out, `home.rail.${i}`).toContain(`data-placement="home.rail.${i}"`)
    expect(out.indexOf('home.rail.6"')).toBeLessThan(out.indexOf('home.rail.7"'))
    expect(out.indexOf('home.rail.9"')).toBeLessThan(out.indexOf('Tail:'))
  })
  it('never stacks two bands: rows with no place join the last anchor\'s band, one label for it', async () => {
    const out = await render(news, { slots: slots(9) })
    expect(out.match(/data-sponsor-band/g)).toHaveLength(2)
    const second = out.slice(out.lastIndexOf('data-sponsor-band'))
    for (const i of [4, 5, 6, 7, 8, 9]) expect(second).toContain(`data-placement="home.rail.${i}"`)
    // Two anchors (a staging page with Local News and Florida News only): one place, and the rest join it instead of a band under it.
    const two = await render(drawn([['a', kind('A', undefined, true)], ['b', kind('B', undefined, true)], ['tail', kind('Tail')]]), { slots: slots(9) })
    expect(two.match(/data-sponsor-band/g)).toHaveLength(2)
    expect(two.indexOf('B:')).toBeLessThan(two.indexOf('home.rail.4"'))
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
  it('gives the top unit to the first block that lays it out, never to a duplicate of it', async () => {
    const two: Drawn[] = drawn([['lead', { ...kind('Lead'), drawsTop: true }], ['again', { ...kind('Again'), drawsTop: true }], ['a', kind('A', undefined, true)]])
    const out = await render(two, { slots: slots(0, { top: tile('home.top.1') }) })
    expect(out).toContain('data-top-given-to="Lead"')
    expect(out).not.toContain('data-top-given-to="Again"')
  })
  it('shows every row after the content when the page has no news run', async () => {
    const out = await render(drawn([['lead', kind('Lead')]]), { slots: slots(3) })
    expect(out.indexOf('Lead:')).toBeLessThan(out.indexOf('home.rail.1"'))
  })
  it('draws no slot for a page set that does not allow placements, or when the route loaded no tiles', async () => {
    expect(await render(news, { setId: 'giving', slots: slots(6) })).not.toContain('data-placement')
    expect(await render(news, {})).not.toContain('data-placement')
  })
})

describe('call-to-action sections in a row', () => {
  const cta = (id: string, title: string, tone = 'plain') => ({ blockType: 'sectionClosingBand', id, tone, heading: { title }, actions: [{ label: `Go ${id}`, href: '/go' }] })
  const callout = (id: string) => ({ blockType: 'sectionCallout', id, tone: 'plain', text: 'A note.' })
  const html = (sections: unknown[], context: Partial<SectionContext> = {}) =>
    renderToStaticMarkup(createElement(RenderSections, { sections: sections as never, context: { themeId: 'wuwf', setId: null, draft: false, pageId: 1, ...context } }))

  it('finds runs of two or more, and leaves a single one alone', () => {
    const entry = (c: boolean): SectionBlockEntry => ({ dir: 'x', block: { slug: 'x', fields: [] }, Component: () => null, cta: c })
    const d = (key: string, c: boolean): Drawn => ({ block: { blockType: 'x', id: key }, key, entry: entry(c) })
    const { starts, consumed } = ctaRuns([d('a', false), d('b', true), d('c', true), d('d', true), d('e', false), d('f', true)])
    expect([...starts.keys()]).toEqual(['b'])
    expect(starts.get('b')!.map((x) => x.key)).toEqual(['b', 'c', 'd'])
    expect([...consumed]).toEqual(['c', 'd'])
  })
  it('draws two in a row as one band of cards, each in its own tone, not two bands stacked', () => {
    const out = html([cta('a', 'Join us', 'dark'), cta('b', 'Support us', 'plain')])
    expect((out.match(/data-section="ctaGroup"/g) ?? []).length).toBe(1)
    expect(out).not.toMatch(/<section[^>]*data-section="sectionClosingBand"/)
    expect(out).toContain('Join us')
    expect(out).toContain('Support us')
    expect(out).toContain('data-tone="dark"')
    expect(out.indexOf('Join us')).toBeLessThan(out.indexOf('Support us'))
  })
  it('keeps the page\'s own section order: what comes before and after stays where it is', () => {
    const out = html([callout('n1'), cta('a', 'First'), cta('b', 'Second'), callout('n2')])
    expect(out.indexOf('A note.')).toBeLessThan(out.indexOf('First'))
    expect(out.lastIndexOf('A note.')).toBeGreaterThan(out.indexOf('Second'))
  })
  it('draws one on its own as a single card in its own band, and two apart as two single cards', () => {
    expect(html([cta('a', 'Alone')])).not.toContain('ctaGroup')
    const apart = html([cta('a', 'One'), callout('n'), cta('b', 'Two')])
    expect(apart).not.toContain('ctaGroup')
    expect((apart.match(/<section[^>]*data-section="sectionClosingBand"/g) ?? []).length).toBe(2)
  })
  it('does the same on a page set\'s ordered pass', async () => {
    const entry = (label: string, isCta: boolean): SectionBlockEntry => ({ dir: label, block: { slug: `section${label}`, fields: [] }, Component: ({ block }: { block: { id?: string } }) => createElement('i', { 'data-card': block.id }), cta: isCta })
    const d: Drawn[] = [
      { block: { blockType: 'x', id: 'lead' }, key: 'lead', entry: entry('Lead', false) },
      { block: { blockType: 'x', id: 'a' }, key: 'a', entry: entry('A', true) },
      { block: { blockType: 'x', id: 'b' }, key: 'b', entry: entry('B', true) },
    ]
    const out = renderToStaticMarkup((await OrderedSections({ drawn: d, context: { themeId: 'wuwf', setId: 'voyager', draft: false, pageId: 1 } })) as never)
    expect((out.match(/data-section="ctaGroup"/g) ?? []).length).toBe(1)
    expect(out).toContain('data-card="a"')
    expect(out).toContain('data-card="b"')
  })
})
