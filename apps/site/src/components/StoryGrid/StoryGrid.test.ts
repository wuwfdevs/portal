import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { StoryGrid } from './index'

const story = (id: number) => ({ id, title: `Story ${id}`, path: `/news/2026-01-01/story-${id}`, publishedAt: '2026-01-01T00:00:00.000Z', meta: {}, categories: [], contributors: [], featuredMedia: null }) as never
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
  it('spans the first card only when asked, so the last row is not short, and not beside a rail', () => {
    const five = [1, 2, 3, 4, 5].map(story)
    expect(draw({ stories: five })).not.toContain('col-span')
    expect(draw({ stories: five, spanFirst: true })).toContain('lg:col-span-2')
    expect(draw({ stories: five, spanFirst: true, beside: true })).not.toContain('col-span')
    expect(draw({ stories: five, beside: true })).toContain('lg:grid-cols-2')
  })
})
