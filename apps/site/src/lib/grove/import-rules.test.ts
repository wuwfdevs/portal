import { describe, expect, it } from 'vitest'

import { DEFAULT_BYLINE, planImport, sectionTitlesBySegment, titleFromSegment } from './import-rules'
import type { ConvertedStory } from './types'

type S = Pick<ConvertedStory, 'path' | 'section' | 'byline'>
const story = (over: Partial<S> = {}): S => ({
  path: '/local-arts/2020-01-01/a-story',
  section: null,
  byline: { people: [{ name: 'Dave Dunwoody', slug: 'dave-dunwoody' }], text: null },
  ...over,
})

describe('titleFromSegment', () => {
  it('makes a readable title from a path segment', () => {
    expect(titleFromSegment('local-arts')).toBe('Local Arts')
    expect(titleFromSegment('uwf-news')).toBe('Uwf News')
  })
})

describe('sectionTitlesBySegment', () => {
  it('uses the title most stories under a segment carry, so real names survive', () => {
    const m = sectionTitlesBySegment([
      { path: '/uwf-news/2020-01-01/a', section: { title: 'UWF News', path: '/uwf-news' } },
      { path: '/uwf-news/2020-01-02/b', section: { title: 'UWF News', path: '/uwf-news' } },
      { path: '/uwf-news/2020-01-03/c', section: null },
    ])
    expect(m.get('uwf-news')).toBe('UWF News')
  })
})

describe('planImport: section', () => {
  it('keeps the section Grove named, filed under the first part of the path', () => {
    const p = planImport(story({ section: { title: 'Local Arts', path: '/local-arts' } }), new Map())
    expect(p.section).toEqual({ title: 'Local Arts', slug: 'local-arts' })
    expect(p.notes.map((n) => n.code)).not.toContain('import.section-from-path')
  })
  it('with none, files it by the path, using the known title when there is one, and says so', () => {
    const known = planImport(story({ path: '/uwf-news/2020-01-01/x' }), new Map([['uwf-news', 'UWF News']]))
    expect(known.section).toEqual({ title: 'UWF News', slug: 'uwf-news' })
    const unknown = planImport(story(), new Map())
    expect(unknown.section).toEqual({ title: 'Local Arts', slug: 'local-arts' })
    expect(unknown.notes).toEqual([{ code: 'import.section-from-path', detail: 'local-arts → Local Arts' }])
  })
})

describe('planImport: byline', () => {
  it('leaves named people as they are, including one with no profile page', () => {
    const p = planImport(story({ byline: { people: [{ name: 'Danielle Freeman' }], text: null } }), new Map())
    expect(p.people).toEqual([{ name: 'Danielle Freeman' }])
    expect(p.notes.filter((n) => n.code.startsWith('import.byline'))).toEqual([])
  })
  it('credits WUWF Staff when there is no byline, and says so', () => {
    const p = planImport(story({ byline: { people: [], text: null } }), new Map())
    expect(p.people).toEqual([{ name: DEFAULT_BYLINE }])
    expect(p.notes).toContainEqual({ code: 'import.byline-defaulted', detail: DEFAULT_BYLINE })
  })
  it('drops text that is only a fragment of a credited name, with a note', () => {
    for (const text of ['Dave', 'D', 'dunwoody']) {
      const p = planImport(story({ byline: { people: [{ name: 'Dave Dunwoody' }], text } }), new Map())
      expect(p.people).toEqual([{ name: 'Dave Dunwoody' }])
      expect(p.notes.map((n) => n.code)).toContain('import.byline-fragment-dropped')
    }
  })
  it('keeps text that names someone else as a contributor, and flags it', () => {
    const p = planImport(story({ byline: { people: [{ name: 'Sandra Averhart' }], text: 'Rodney Guttmann' } }), new Map())
    expect(p.people.map((x) => x.name)).toEqual(['Sandra Averhart', 'Rodney Guttmann'])
    expect(p.notes).toContainEqual({ code: 'import.byline-text-became-person', detail: 'Rodney Guttmann' })
  })
  it('does not change the story it was given', () => {
    const s = story()
    const before = JSON.stringify(s)
    planImport(s, new Map())
    expect(JSON.stringify(s)).toBe(before)
  })
})
