import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ListItem } from '@/lib/section-data/shape'

import { testContext } from '../testing'
import type { ClipView } from '@/lib/video/load'

import { ClipListView, ListSection, ListView } from './Component'

let items: ListItem[] = []
const loadList = vi.fn(async () => items)
let clips: ClipView[] = []
const loadClipList = vi.fn(async () => clips)
vi.mock('@/lib/section-data/load', () => ({
  loadList: (...a: unknown[]) => (loadList as unknown as (...x: unknown[]) => unknown)(...a),
  loadClipList: (...a: unknown[]) => (loadClipList as unknown as (...x: unknown[]) => unknown)(...a),
}))

const picture = { id: 5, url: '/media/a.jpg', alt: 'A guitar', width: 800, height: 600, mimeType: 'image/jpeg', updatedAt: null, focalX: null, focalY: null }
const entries: ListItem[] = [
  { id: 'post-1', title: 'First story', href: '/news/a', image: picture, meta: 'Story · Nov 1, 2026' },
  { id: 'post-2', title: 'Second story', href: '/news/b', image: null, meta: null },
  { id: 'post-3', title: 'No address', href: null, image: null, meta: 'Audio story' },
]
const view = (block: Record<string, unknown>, list: readonly ListItem[] = entries) =>
  renderToStaticMarkup(createElement(ListView, { block: { blockType: 'sectionList', ...block }, items: list }))
const draw = async (block: Record<string, unknown>) => {
  const out = await ListSection({ block: { blockType: 'sectionList', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}
beforeEach(() => {
  items = entries
  loadList.mockClear()
})

describe('List section: what it reads', () => {
  it('reads nothing and draws nothing when the source needs a choice that is not made', async () => {
    expect(await draw({ source: 'stories', scope: 'section' })).toBe('')
    expect(await draw({ source: 'episodes' })).toBe('')
    expect(await draw({})).toBe('')
    expect(loadList).not.toHaveBeenCalled()
  })
  it('asks for the source it names and only that source\'s choice (a hidden variant\'s data is not read)', async () => {
    await draw({ source: 'stories', scope: 'section', section: { id: 4 }, topic: 9, show: 3 })
    expect(loadList).toHaveBeenLastCalledWith({ source: 'stories', scope: 'section', id: 4, count: 6 })
    await draw({ source: 'episodes', show: 3, section: 4, count: 3 })
    expect(loadList).toHaveBeenLastCalledWith({ source: 'episodes', id: 3, count: 3 })
  })
  it('draws nothing when nothing is published', async () => {
    items = []
    expect(await draw({ source: 'videos' })).toBe('')
  })
})

describe('List section: the four layouts', () => {
  it('grid: a card each, one link per card, the title unlinked without an address', () => {
    const out = view({ variant: 'grid', tone: 'grey', anchor: 'news', heading: { title: 'Latest' }, moreLabel: 'All stories', moreHref: '/latest' })
    expect(out).toContain('data-tone="grey"')
    expect(out).toContain('id="news"')
    expect(out.match(/<li/g)?.length).toBe(3)
    expect(out.match(/href="\/news\//g)?.length).toBe(2)
    expect(out).toContain('No address')
    expect(out).toContain('All stories')
    expect(out).toContain('href="/latest"')
    expect(out.match(/<img/g)?.length).toBe(1)
  })
  it('rail: a scrollable region a keyboard can reach', () => {
    const out = view({ variant: 'rail', heading: { title: 'Recent sets' } })
    expect(out).toContain('role="region"')
    expect(out).toContain('tabindex="0"')
    expect(out).toContain('aria-label="Recent sets"')
    expect(out).toContain('overflow-x-auto')
  })
  it('numbered: an ordered list with the numbers drawn from position', () => {
    const out = view({ variant: 'numbered' })
    expect(out).toContain('<ol')
    expect(out).toContain('>1<')
    expect(out).toContain('>3<')
  })
  it('lead: the first entry large, the others beside it; one entry alone has no side list', () => {
    const out = view({ variant: 'lead' })
    expect(out).toContain('text-3xl')
    expect(out.match(/<li/g)?.length).toBe(2)
    expect(view({ variant: 'lead' }, [entries[0]!])).not.toContain('<ul')
  })
  it('draws no more link for an unsafe address, and nothing for no entries', () => {
    expect(view({ moreLabel: 'More', moreHref: 'javascript:x' })).not.toContain('More')
    expect(view({}, [])).toBe('')
  })
})

describe('List section: tiles and rows (the podcast directory)', () => {
  const shows: ListItem[] = [
    { id: 'show-1', title: 'Gulf Coast Reports', href: '/shows/gulf-coast', image: picture, meta: '12 episodes · latest Nov 3, 2026', summary: 'Stories from the shore\nWeekly reporting.' },
    { id: 'show-2', title: 'No cover', href: '/shows/none', image: null, meta: '1 episode', summary: null },
  ]
  it('tiles: a square picture, the show as one link, its lines and its count', () => {
    const html = view({ variant: 'tiles' }, shows)
    expect(html).toContain('aspect-square')
    expect(html).toContain('Stories from the shore')
    expect(html).toContain('Weekly reporting.')
    expect(html).toContain('12 episodes · latest Nov 3, 2026')
    expect(html.match(/<a /g)).toHaveLength(2)
  })
  it('rows: the details line first, then the title, and no picture', () => {
    const html = view({ variant: 'rows' }, entries)
    expect(html).not.toContain('<img')
    expect(html.indexOf('Story · Nov 1, 2026')).toBeLessThan(html.indexOf('First story'))
    expect(html).toContain('<ol')
  })
  it('asks for every listed show, and for episodes across all shows only when told', async () => {
    await draw({ source: 'shows', count: 3, show: 2 })
    expect(loadList).toHaveBeenLastCalledWith({ source: 'shows' })
    await draw({ source: 'episodes', allShows: true, show: 2, count: 4 })
    expect(loadList).toHaveBeenLastCalledWith({ source: 'episodes', all: true, count: 4 })
  })
})

const clip = (over: Partial<ClipView> = {}): ClipView => ({
  id: 1, slug: 'a-clip', title: 'A clip', description: null, videoUrl: '/v.mp4', mimeType: 'video/mp4', posterUrl: '/p.jpg', durationSeconds: 75, by: 'Leigh Ostrander', publishedAt: null,
  series: null, story: null, sectionId: 7, captionsHref: '/video/a-clip/captions.vtt', ...over,
})

describe('List section: short videos', () => {
  it('reads the clips (all, or a section\'s) and not the stories', async () => {
    clips = [clip()]
    await draw({ source: 'clips' })
    expect(loadClipList).toHaveBeenLastCalledWith({ source: 'clips', scope: 'latest', count: 6 })
    await draw({ source: 'clips', scope: 'section', section: { id: 7 }, count: 4 })
    expect(loadClipList).toHaveBeenLastCalledWith({ source: 'clips', scope: 'section', id: 7, count: 4 })
    expect(await draw({ source: 'clips', scope: 'section' })).toBe('')
  })
  it('draws the poster rail in the band, with the more link in the header, and nothing without clips', async () => {
    const out = renderToStaticMarkup(createElement(ClipListView, { block: { blockType: 'sectionList', heading: { title: 'Watch' }, moreLabel: 'All videos', moreHref: '/video' }, clips: [clip()] }))
    expect(out).toContain('href="/video/a-clip"')
    expect(out).toContain('--tone-muted')
    expect(out.indexOf('/video"')).toBeLessThan(out.indexOf('/video/a-clip'))
    expect(renderToStaticMarkup(createElement(ClipListView, { block: { blockType: 'sectionList' }, clips: [] }))).toBe('')
  })
})
