import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { ClipRail } from '@/components/Video/ClipRail'
import type { ClipView } from '@/lib/video/load'

import { TitledSection } from './index'

const draw = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(TitledSection as never, { id: 'x-heading', title: 'Local News', ...props }, createElement('p', null, 'Content')))

describe('TitledSection', () => {
  it('is a landmark labelled by its heading, with the heading first and the content under it', () => {
    const out = draw({})
    expect(out).toContain('aria-labelledby="x-heading"')
    expect(out).toContain('id="x-heading"')
    expect(out.indexOf('Local News')).toBeLessThan(out.indexOf('Content'))
  })
  it('puts the "more" link in the header, before the content, and links the title when it has a page', () => {
    const out = draw({ href: '/local-news', more: { href: '/local-news', label: 'More from Local News' } })
    expect(out.indexOf('More from Local News')).toBeLessThan(out.indexOf('Content'))
    expect(out).toContain('href="/local-news"')
  })
  it('draws no link without one', () => {
    expect(draw({})).not.toContain('href=')
  })
})

const clip = (over: Partial<ClipView> = {}): ClipView => ({
  id: 1, slug: 'a-clip', title: 'A clip', description: null, videoUrl: '/v.mp4', mimeType: 'video/mp4', posterUrl: '/p.jpg', durationSeconds: 75, by: 'Leigh Ostrander', publishedAt: null,
  series: { id: 2, slug: 's', title: 'After Isaias' }, story: null, sectionId: 7, captionsHref: '/video/a-clip/captions.vtt', ...over,
})

describe('ClipRail', () => {
  it('draws nothing without clips', () => {
    expect(renderToStaticMarkup(createElement(ClipRail, { clips: [], label: 'Videos' }))).toBe('')
  })
  it('draws each clip as one link to its page, with its series, length and credit', () => {
    const out = renderToStaticMarkup(createElement(ClipRail, { clips: [clip()], label: 'Short videos from Local News' }))
    expect(out).toContain('aria-label="Short videos from Local News"')
    expect(out).toContain('href="/video/a-clip"')
    expect(out).toContain('After Isaias')
    expect(out).toContain('1:15')
    expect(out).toContain('Leigh Ostrander')
  })
})
