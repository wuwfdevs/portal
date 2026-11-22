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
  it('gives a lead a row of its own, picture left and words right, with a rule under it, and draws every other card as the usual column', () => {
    const five = draw({ stories: [1, 2, 3, 4, 5].map(story), spanFirst: true })
    expect(five.match(/sm:flex-row/g)).toHaveLength(1)
    expect(five.match(/border-b border-rule/g)).toHaveLength(1)
    expect(five.match(/aspect-\[3\/2\]/g)).toHaveLength(5)
    expect(five).not.toContain('col-span')
    expect(five).not.toContain('before:pt-')
    expect(draw({ stories: [1, 2, 3, 4, 5].map(story) })).not.toContain('sm:flex-row')
    expect(draw({ stories: [1, 2, 3, 4, 5].map(story), spanFirst: true, beside: true })).not.toContain('sm:flex-row')
  })
  it('puts the lead above and outside the grid, so no card shares its row', () => {
    const out = draw({ stories: [1, 2, 3, 4].map(story), spanFirst: true })
    const grid = out.indexOf('<ul')
    expect(out.indexOf('Story 1')).toBeLessThan(grid)
    for (const t of ['Story 2', 'Story 3', 'Story 4']) expect(out.indexOf(t)).toBeGreaterThan(grid)
    expect(out.match(/<li/g)).toHaveLength(3)
  })
  it('runs the rest in a whole row: two for a run of three, three for a run of four, four for a run of five, three across for seven', () => {
    const cols = (n: number) => draw({ stories: Array.from({ length: n }, (_, i) => story(i + 1)), spanFirst: true })
    expect(cols(3)).not.toContain('lg:grid-cols')
    expect(cols(4)).toContain('lg:grid-cols-3')
    expect(cols(5)).toContain('lg:grid-cols-4')
    expect(cols(7)).toContain('lg:grid-cols-3')
  })
  it('keeps a single story, or any grid not asked to span, as one plain grid', () => {
    expect(draw({ stories: [story(1)], spanFirst: true })).not.toContain('border-b border-rule')
    expect(draw({ stories: [1, 2, 3, 4, 5].map(story) })).not.toContain('border-b border-rule')
    expect(draw({ stories: [1, 2, 3, 4, 5].map(story), beside: true })).toContain('lg:grid-cols-2')
  })
})

describe('StoryGrid variant', () => {
  it('draws editorial cards for the home page and keeps the bordered cards by default, for the list pages', () => {
    const stories = [1, 2, 3].map(story)
    expect(draw({ stories, variant: 'editorial' })).not.toContain('border-rule')
    expect(draw({ stories })).toContain('border-rule')
  })
})

describe('StoryGrid: section and date', () => {
  const picture = (n: number) => ({ ...(story(n) as object), section: { id: 1, title: 'Local Arts', slug: 'local-arts', swatch: 'lime' } }) as never
  it('draws the section chip by default and leaves it off when asked, and draws no date unless asked', () => {
    const stories = [1, 2, 3].map(picture)
    expect(draw({ stories, variant: 'editorial' })).toContain('Local Arts')
    expect(draw({ stories, variant: 'editorial', showSection: false })).not.toContain('Local Arts')
    expect(draw({ stories, variant: 'editorial' })).not.toContain('Dec 31, 2025')
    expect(draw({ stories, variant: 'editorial', showDate: true })).toContain('Dec 31, 2025')
  })
})
