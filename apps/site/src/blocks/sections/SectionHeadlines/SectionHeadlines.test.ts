import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { testContext } from '../testing'
import { SectionHeadlinesSection, SectionHeadlinesView, columnKey, headlineSectionIds, headlinesCount, sectionHeadlinesClaim } from './Component'

const story = (sectionId: number, n: number) => ({ id: sectionId * 100 + n, title: `S${sectionId} story ${n}`, path: `/s${sectionId}/2026-11-20/story-${n}`, publishedAt: '2026-11-20T12:00:00.000Z' })
const sections: Record<number, { id: number; title: string; slug: string } | null> = {}
const newest = vi.fn(async (id: number, count: number) => Array.from({ length: count + 12 }, (_, i) => story(id, i + 1)))
vi.mock('@/lib/home-blocks/load', () => ({
  newestInSection: (...a: [number, number]) => newest(...a),
  sectionById: async (id: number) => sections[id] ?? null,
}))

const block = (over: Record<string, unknown> = {}) => ({ blockType: 'sectionHeadlines', id: 'h1', sections: [1, 2, 3], ...over }) as never
const draw = async (b: never, claims?: ReadonlyMap<string, readonly (string | number)[]>) => {
  const out = await SectionHeadlinesSection({ block: b, context: { ...testContext, ...(claims ? { claims } : {}) } })
  return out ? renderToStaticMarkup(out as never) : ''
}

beforeEach(() => {
  sections[1] = { id: 1, title: 'Local Politics', slug: 'local-politics' }
  sections[2] = { id: 2, title: 'Local Arts', slug: 'local-arts' }
  sections[3] = { id: 3, title: 'UWF News', slug: 'uwf-news' }
  newest.mockClear()
})

describe('More by section', () => {
  it('reads the sections in order, once each, at most three', () => {
    expect(headlineSectionIds([2, { id: 1 }, 2, null, 3, 4])).toEqual([2, 1, 3])
    expect(headlineSectionIds(undefined)).toEqual([])
  })
  it('holds the count to its range', () => {
    expect(headlinesCount(undefined)).toBe(4)
    expect(headlinesCount(1)).toBe(3)
    expect(headlinesCount(40)).toBe(6)
  })
  it('draws a column per section: its title linking to its page, then text-only headlines with dates, and "All stories" in the heading row', async () => {
    const out = await draw(block({ count: 3 }))
    expect(out).toContain('More by section')
    expect(out).toContain('href="/local-politics"')
    expect(out).toContain('href="/uwf-news"')
    expect(out).toContain('S1 story 3')
    expect(out).not.toContain('S1 story 4')
    expect(out).toContain('Nov 20, 2026')
    expect(out).toContain('href="/latest"')
    expect(out.indexOf('All stories')).toBeLessThan(out.indexOf('Local Politics'))
    expect(out).toContain('md:grid-cols-3')
    expect(out).not.toContain('<img')
    // Each column leads on to its section's page, under its headlines.
    expect(out).toContain('More from Local Politics →')
    expect(out.indexOf('S1 story 3')).toBeLessThan(out.indexOf('More from Local Politics'))
    expect(out).toContain('More from UWF News →')
  })
  it('shows what the page handed each column, and leaves out a column with nothing left', async () => {
    const claims = new Map([
      [columnKey('h1', 1), [102, 105]],
      [columnKey('h1', 2), []],
      [columnKey('h1', 3), [301]],
    ])
    const out = await draw(block(), claims)
    expect(out).toContain('S1 story 2')
    expect(out).not.toContain('S1 story 1<')
    expect(out).not.toContain('Local Arts')
    expect(out).toContain('md:grid-cols-2')
  })
  it('draws nothing without sections, once they are all deleted, or with no story anywhere', async () => {
    expect(await draw(block({ sections: [] }))).toBe('')
    sections[1] = sections[2] = sections[3] = null
    expect(await draw(block())).toBe('')
    expect(renderToStaticMarkup(SectionHeadlinesView({ block: block(), columns: [] }) ?? (null as never))).toBe('')
  })
  it('asks the page once per column, in order', async () => {
    const asks = await sectionHeadlinesClaim(block({ count: 5 }))
    expect(asks?.map((a) => a.part)).toEqual(['1', '2', '3'])
    expect(asks?.[0]?.take).toBe(5)
    expect(await sectionHeadlinesClaim(block({ sections: [] }))).toBeNull()
  })
})
