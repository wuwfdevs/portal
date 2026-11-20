import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { FrontPageSection, frontPageClaim } from './Component'

const story = (id: number, title: string) => ({ id, title, path: `/news/2026-11-20/story-${id}`, publishedAt: '2026-11-20T12:00:00.000Z', meta: { description: `About ${title}.` }, categories: [], contributors: [], featuredMedia: null, section: null })
let arranged = { lead: story(1, 'The lead') as ReturnType<typeof story> | null, top: [story(2, 'Second'), story(3, 'Third')] }
const arrangeFront = vi.fn(async () => arranged)
const storiesByIds = vi.fn(async (ids: readonly number[]) => ids.map((id) => story(id, `Claimed ${id}`)))
vi.mock('@/lib/home-blocks/load', () => ({
  TOP_COUNT: 5,
  arrangeFront: (...a: unknown[]) => (arrangeFront as unknown as (...x: unknown[]) => unknown)(...a),
  storiesByIds: (...a: unknown[]) => (storiesByIds as unknown as (...x: unknown[]) => unknown)(...a),
}))

const draw = async (block: Record<string, unknown>, claims?: ReadonlyMap<string, readonly (string | number)[]>, context: Record<string, unknown> = {}) => {
  const out = await FrontPageSection({ block: { blockType: 'sectionFrontPage', ...block } as never, context: { ...testContext, ...(claims ? { claims } : {}), ...context } })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  arranged = { lead: story(1, 'The lead'), top: [story(2, 'Second'), story(3, 'Third')] }
  arrangeFront.mockClear()
  storiesByIds.mockClear()
})

describe('Front page lead', () => {
  it('draws the lead story and The Briefing, in the band', async () => {
    const out = await draw({ tone: 'plain', leadKicker: 'After Isaias' })
    expect(out).toContain('The lead')
    expect(out).toContain('After Isaias')
    expect(out).toContain('The Briefing')
    expect(out).toContain('Second')
    expect(out).toContain('data-tone="plain"')
  })
  it('draws nothing when no story is published', async () => {
    arranged = { lead: null, top: [] }
    expect(await draw({})).toBe('')
  })
  it('takes its stories from the page\'s ordered pass when it has one: the first is the lead, the rest the Briefing', async () => {
    const out = await draw({ id: 'blk' }, new Map([['blk', [9, 8, 7]]]))
    expect(storiesByIds).toHaveBeenCalledWith([9, 8, 7])
    expect(arrangeFront).not.toHaveBeenCalled()
    expect(out.indexOf('Claimed 9')).toBeLessThan(out.indexOf('The Briefing'))
    expect(out).toContain('Claimed 8')
  })
  it('claims its lead and Briefing first, pinned, six in all', async () => {
    expect(await frontPageClaim({ blockType: 'sectionFrontPage' })).toEqual({ candidates: [], take: 6, pinned: [1, 2, 3] })
  })
})

describe('Front page lead: the top unit', () => {
  const top = { key: 'home.top.1', kind: 'sponsor', label: 'Sponsor message', sponsor: 'Acme', name: 'Acme words', href: 'https://acme.example/', rel: 'sponsored noopener noreferrer', image: { id: 1, url: '/a.png', alt: 'a', width: 970, height: 250 }, phoneImage: null }
  const home = { setId: 'home', slots: { top, rail: [], fillers: [], band: null } }
  it('lays the page\'s top unit out between the lead and The Briefing, ordered by the screen, once', async () => {
    const out = await draw({}, undefined, home)
    expect(out.match(/data-placement="home\.top\.1"/g)).toHaveLength(1)
    expect(out.indexOf('The lead')).toBeLessThan(out.indexOf('home.top.1'))
    expect(out.indexOf('home.top.1')).toBeLessThan(out.indexOf('The Briefing'))
    expect(out).toContain('order-2 md:order-1')
  })
  it('draws no unit on a page in a set without slots, or when the route loaded none', async () => {
    expect(await draw({}, undefined, { ...home, setId: 'giving' })).not.toContain('data-placement')
    expect(await draw({}, undefined, {})).not.toContain('data-placement')
  })
})
