import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { StoryGrid } from './index'

const story = (id: number) => ({ id, title: `Story ${id}`, path: `/news/2026-01-01/story-${id}`, publishedAt: '2026-01-01T00:00:00.000Z', meta: { image: { id, url: `/media/${id}.jpg`, alt: 'A picture', width: 800, height: 600, mimeType: 'image/jpeg', updatedAt: null, focalX: null, focalY: null } }, categories: [], contributors: [], featuredMedia: null }) as never
const draw = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(StoryGrid as never, props))

describe('StoryGrid', () => {
  it('draws nothing without stories', () => {
    expect(draw({ stories: [] })).toBe('')
  })
  it('draws each story as a card in a grid: two across on a tablet, three on a wide screen', () => {
    const out = draw({ stories: [1, 2, 3].map(story) })
    expect(out).toContain('sm:grid-cols-2')
    expect(out).toContain('lg:grid-cols-3')
    for (const t of ['Story 1', 'Story 2', 'Story 3']) expect(out).toContain(t)
  })
  it('gives a spanning lead a wider picture frame so the card beside it is not stretched, and every other card the usual one', () => {
    const five = draw({ stories: [1, 2, 3, 4, 5].map(story), spanFirst: true })
    expect(five).toContain('lg:aspect-[3/1]')
    expect(five.match(/aspect-\[3\/2\]/g)).toHaveLength(5)
    expect(draw({ stories: [1, 2, 3, 4].map(story), spanFirst: true })).toContain('lg:aspect-[7/2]')
    expect(draw({ stories: [1, 2, 3, 4, 5].map(story) })).not.toContain('lg:aspect-[3/1]')
    expect(draw({ stories: [1, 2, 3, 4, 5].map(story), spanFirst: true, beside: true })).not.toContain('lg:aspect-[3/1]')
  })
  it('spans the first card only when asked, so the last row is not short, and not beside a rail', () => {
    const five = [1, 2, 3, 4, 5].map(story)
    expect(draw({ stories: five })).not.toContain('col-span')
    expect(draw({ stories: five, spanFirst: true })).toContain('lg:col-span-2')
    expect(draw({ stories: five, spanFirst: true, beside: true })).not.toContain('col-span')
    expect(draw({ stories: five, beside: true })).toContain('lg:grid-cols-2')
  })
})
