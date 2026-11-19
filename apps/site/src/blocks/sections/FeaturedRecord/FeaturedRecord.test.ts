import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FeaturedItem } from '@/lib/section-data/shape'

import { testContext } from '../testing'
import { FeaturedRecordSection, FeaturedRecordView } from './Component'

let loaded: FeaturedItem | null = null
const loadFeatured = vi.fn(async () => loaded)
vi.mock('@/lib/section-data/load', () => ({ loadFeatured: (...a: unknown[]) => (loadFeatured as unknown as (...x: unknown[]) => unknown)(...a) }))

const picture = { id: 5, url: '/media/a.jpg', alt: 'A guitar', width: 800, height: 600, mimeType: 'image/jpeg', updatedAt: null, focalX: null, focalY: null }
const story: FeaturedItem = { kind: 'story', title: 'Hurricane season', description: 'What changed.', href: '/news/2026-11-01/hurricane', image: picture, audio: null }
const draw = async (block: Record<string, unknown>) => {
  const out = await FeaturedRecordSection({ block: { blockType: 'sectionFeaturedRecord', ...block } as never, context: testContext })
  return out ? renderToStaticMarkup(out as never) : ''
}

beforeEach(() => {
  loaded = story
  loadFeatured.mockClear()
})

describe('Featured record', () => {
  it('draws nothing, and reads nothing, when no record is chosen', async () => {
    expect(await draw({})).toBe('')
    expect(await draw({ mode: 'newest' })).toBe('')
    expect(await draw({ mode: 'pick', record: { relationTo: 'posts', value: null } })).toBe('')
    expect(loadFeatured).not.toHaveBeenCalled()
  })
  it('asks for the record it names, and for the newest of a section', async () => {
    await draw({ record: { relationTo: 'posts', value: { id: 7 } } })
    expect(loadFeatured).toHaveBeenLastCalledWith({ mode: 'pick', relationTo: 'posts', id: 7 })
    await draw({ mode: 'newest', section: 3, record: { relationTo: 'posts', value: 7 } })
    expect(loadFeatured).toHaveBeenLastCalledWith({ mode: 'newest', sectionId: 3 })
  })
  it('draws nothing when the record is gone', async () => {
    loaded = null
    expect(await draw({ record: { relationTo: 'posts', value: 7 } })).toBe('')
  })
  it('hero: the record\'s headline, line and a button to it, with the default words', async () => {
    const out = await draw({ record: { relationTo: 'posts', value: 7 }, variant: 'hero', tone: 'dark', anchor: 'lead' })
    expect(out).toContain('<h1')
    expect(out).toContain('Hurricane season')
    expect(out).toContain('What changed.')
    expect(out).toContain('>Story<')
    expect(out).toContain('Read the story')
    expect(out).toContain('href="/news/2026-11-01/hurricane"')
    expect(out).toContain('data-tone="dark"')
    expect(out).toContain('id="lead"')
  })
  it('split: an h2 and the split-only choices; the editor\'s own words replace the defaults', async () => {
    const out = await draw({ record: { relationTo: 'posts', value: 7 }, variant: 'split', ratio: 'wide', imageSide: 'left', label: 'Lead story', actionLabel: 'Read on' })
    expect(out).toContain('<h2')
    expect(out).toContain('aspect-video')
    expect(out).toContain('Lead story')
    expect(out).toContain('Read on')
  })
  it('a show says "Show" and "See the show"; a record with no address has no button', () => {
    const show: FeaturedItem = { kind: 'show', title: 'Barefoot Mary', description: 'Folk', href: '/shows/barefoot-mary', image: null, audio: null }
    const html = (item: FeaturedItem) => renderToStaticMarkup(createElement(FeaturedRecordView, { block: { blockType: 'sectionFeaturedRecord' }, context: testContext, item }))
    expect(html(show)).toContain('See the show')
    expect(html({ ...show, href: null })).not.toContain('<a ')
  })
})
