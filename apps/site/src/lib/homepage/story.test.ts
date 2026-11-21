import { describe, expect, it } from 'vitest'

import { kickerOf, sectionOf } from './story'

const story = (section: unknown) => ({ section: section as never, categories: [] })

describe('sectionOf and kickerOf', () => {
  it('give the loaded section\'s title and its swatch', () => {
    expect(sectionOf(story({ id: 1, title: 'Local Arts', swatch: 'amber' }))).toEqual({ title: 'Local Arts', swatch: 'amber' })
    expect(kickerOf(story({ id: 1, title: 'Local Arts', swatch: 'amber' }))).toBe('Local Arts')
  })
  it('fall back to the default swatch for a section with none, or one the code does not know', () => {
    expect(sectionOf(story({ id: 1, title: 'News', swatch: null }))?.swatch).toBe('blue')
    expect(sectionOf(story({ id: 1, title: 'News' }))?.swatch).toBe('blue')
    expect(sectionOf(story({ id: 1, title: 'News', swatch: 'purple' }))?.swatch).toBe('blue')
  })
  it('give nothing for a section that was not loaded (a bare id), is missing, or has no title', () => {
    for (const section of [7, '7', null, undefined, { id: 1 }, { id: 1, title: '' }]) {
      expect(sectionOf(story(section))).toBeNull()
      expect(kickerOf(story(section))).toBeNull()
    }
  })
})
