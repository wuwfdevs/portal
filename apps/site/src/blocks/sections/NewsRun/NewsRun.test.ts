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
  it('draws nothing when the pass left it nothing', async () => {
    expect(await draw({ id: 'run', section: 4 }, new Map([['run', []]]))).toBe('')
  })
  it('asks for its newest with the slack the pass needs, and takes its count, kept between 3 and 8', async () => {
    expect(await newsRunClaim({ blockType: 'sectionNewsRun', section: 4, count: 20 })).toMatchObject({ take: 8 })
    expect(await newsRunClaim({ blockType: 'sectionNewsRun', section: 4, count: 1 })).toMatchObject({ take: 3 })
    expect(await newsRunClaim({ blockType: 'sectionNewsRun' })).toBeNull()
  })
})
