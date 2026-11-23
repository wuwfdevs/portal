import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { NewsRunSection, newsRunClaim } from './Component'

const story = (id: number) => ({ id, title: `Story ${id}`, path: `/local/2026-11-20/story-${id}`, publishedAt: '2026-11-20T12:00:00.000Z', meta: {}, categories: [], contributors: [], featuredMedia: null, section: null })
let section: { id: number; title: string; slug: string } | null = { id: 4, title: 'Local News', slug: 'local-news' }
const newest = vi.fn(async (_id: unknown, count: number) => Array.from({ length: count + 12 }, (_, i) => story(i + 1)))
vi.mock('@/lib/home-blocks/load', () => ({
  newestInSection: (...a: [unknown, number]) => newest(...a),
  sectionById: async () => section,
}))

const draw = async (block: Record<string, unknown>, claims?: ReadonlyMap<string, readonly (string | number)[]>) => {
  const out = await NewsRunSection({ block: { blockType: 'sectionNewsRun', ...block } as never, context: { ...testContext, ...(claims ? { claims } : {}) } })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  section = { id: 4, title: 'Local News', slug: 'local-news' }
  newest.mockClear()
})

describe('News run', () => {
  it('draws nothing, and reads nothing, without a section, or once the section is deleted', async () => {
    expect(await draw({})).toBe('')
    expect(newest).not.toHaveBeenCalled()
    section = null
    expect(await draw({ section: 4 })).toBe('')
  })
  it('draws the newest of the section, headed by its title, with "More from" in the header', async () => {
    const out = await draw({ section: { id: 4 }, count: 3 })
    expect(out).toContain('Local News')
    expect(out).toContain('Story 1')
    expect(out).toContain('Story 3')
    expect(out).not.toContain('Story 4')
    expect(out).toContain('More from Local News')
    expect(out.indexOf('More from Local News')).toBeLessThan(out.indexOf('Story 1'))
    expect(out).toContain('href="/local-news"')
  })
  it('uses the editor\'s heading when there is one', async () => {
    expect(await draw({ section: 4, heading: { title: 'Around the Gulf' } })).toContain('Around the Gulf')
  })
  it('draws exactly the stories the page\'s ordered pass gave it, in that order', async () => {
    const out = await draw({ id: 'run', section: 4, count: 3 }, new Map([['run', [5, 2, 9]]]))
    expect(out.indexOf('Story 5')).toBeLessThan(out.indexOf('Story 2'))
    expect(out).toContain('Story 9')
    expect(out).not.toContain('Story 1<')
  })
  it('reads the station\'s stories on a station page and only The Voyager\'s on a Voyager page, for the pass and for the draw', async () => {
    await draw({ section: 4, count: 3 })
    expect(newest).toHaveBeenLastCalledWith(4, 3, 'station')
    const voyager = { ...testContext, setId: 'voyager' as const }
    await NewsRunSection({ block: { blockType: 'sectionNewsRun', section: 4, count: 3 } as never, context: voyager })
    expect(newest).toHaveBeenLastCalledWith(4, 3, 'voyager')
    await newsRunClaim({ blockType: 'sectionNewsRun', section: 4, count: 3 }, voyager)
    expect(newest).toHaveBeenLastCalledWith(4, 3, 'voyager')
  })
  it('leaves the Voyager badge off its cards on a Voyager page and keeps it elsewhere', async () => {
    const voyagerStory = { ...story(1), publishingIdentity: { id: 3, slug: 'the-voyager', name: 'The Voyager' } }
    newest.mockImplementationOnce(async () => [voyagerStory] as never).mockImplementationOnce(async () => [voyagerStory] as never)
    const home = renderToStaticMarkup((await NewsRunSection({ block: { blockType: 'sectionNewsRun', section: 4 } as never, context: testContext })) as never)
    expect(home).toContain('Student journalism')
    const voyager = renderToStaticMarkup((await NewsRunSection({ block: { blockType: 'sectionNewsRun', section: 4 } as never, context: { ...testContext, setId: 'voyager' } })) as never)
    expect(voyager).toContain('Story 1')
    expect(voyager).not.toContain('Student journalism')
  })
  it('draws nothing when the pass left it nothing', async () => {
    expect(await draw({ id: 'run', section: 4 }, new Map([['run', []]]))).toBe('')
  })
  it('asks for its newest with the slack the pass needs, and takes its count, kept between 3 and 7', async () => {
    expect(await newsRunClaim({ blockType: 'sectionNewsRun', section: 4, count: 20 })).toMatchObject({ take: 7 })
    expect(await newsRunClaim({ blockType: 'sectionNewsRun', section: 4, count: 8 })).toMatchObject({ take: 7 })
    expect(await newsRunClaim({ blockType: 'sectionNewsRun', section: 4, count: 1 })).toMatchObject({ take: 3 })
    expect(await newsRunClaim({ blockType: 'sectionNewsRun' })).toBeNull()
  })
  it('gives the lead a row of its own with a rule under it, and the rest an even grid below', async () => {
    const out = await draw({ section: 4, count: 5 })
    expect(out).toContain('sm:flex-row')
    expect(out).toContain('border-b border-rule')
    expect(out).toContain('lg:grid-cols-4')
    // The lead sits in the ruled box, which comes before the grid that holds every other story.
    expect(out.indexOf('border-b border-rule')).toBeLessThan(out.indexOf('Story 1'))
    expect(out.indexOf('Story 1')).toBeLessThan(out.indexOf('<ul'))
    expect(out.indexOf('<ul')).toBeLessThan(out.indexOf('Story 2'))
  })
  it('does not repeat the section\'s name on every card, and puts each story\'s date under its headline', async () => {
    section = { id: 4, title: 'Local News', slug: 'local-news' }
    const out = await draw({ section: 4, count: 3 })
    expect(out).not.toContain('rounded-pill')
    expect(out.match(/Local News/g)).toHaveLength(2)
    expect(out.match(/Nov 20, 2026/g)).toHaveLength(3)
  })
})
