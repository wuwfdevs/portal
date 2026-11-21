import { describe, expect, it } from 'vitest'

import { resolveZone, type PlacementRecord } from './resolve'
import { splitForBands, storyPage } from './story'

const para = (text: string) => ({ type: 'paragraph', children: [{ type: 'text', text }] })
const image = { type: 'block', fields: { blockType: 'mediaBlock' } }
const doc = (children: unknown[]) => ({ root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children } })
const text = (n: number) => Array.from({ length: n }, (_, i) => para(`Paragraph ${i + 1}.`))

describe('splitForBands', () => {
  const sizes = (parts: Array<{ root: { children: unknown[] } }> | null) => parts?.map((p) => p.root.children.length) ?? null
  it('puts the first band after the fourth paragraph of a story of at least six, keeping the document\'s settings', () => {
    const out = splitForBands(doc(text(8)), 1)!
    expect(sizes(out)).toEqual([4, 4])
    for (const part of out) expect(part.root).toMatchObject({ type: 'root', direction: 'ltr', version: 1 })
  })
  it('puts a second band after the twelfth paragraph only in a story of sixteen or more, and only when a second placement runs', () => {
    expect(sizes(splitForBands(doc(text(20)), 2))).toEqual([4, 8, 8])
    expect(sizes(splitForBands(doc(text(20)), 1))).toEqual([4, 16])
    expect(sizes(splitForBands(doc(text(15)), 2))).toEqual([4, 11])
    expect(sizes(splitForBands(doc(text(16)), 2))).toEqual([4, 8, 4])
  })
  it('never more than two bands, and none for none', () => {
    expect(sizes(splitForBands(doc(text(40)), 5))).toEqual([4, 8, 28])
    expect(splitForBands(doc(text(40)), 0)).toBeNull()
  })
  it('counts only paragraphs with words, so a picture, an embed or an empty line does not move a band', () => {
    const children = [para('One.'), image, para(''), para('Two.'), para('Three.'), image, para('Four.'), para('Five.'), para('Six.')]
    expect(sizes(splitForBands(doc(children), 1))).toEqual([7, 2]) // up to and including the fourth paragraph with words
  })
  it('leaves a short story, or one with no body, without a band', () => {
    expect(splitForBands(doc(text(5)), 2)).toBeNull()
    expect(splitForBands(doc([image, image, ...text(3)]), 2)).toBeNull()
    expect(splitForBands(null, 1)).toBeNull()
    expect(splitForBands({} as never, 1)).toBeNull()
  })
})

describe('storyPage and a story\'s placements', () => {
  const rec = (over: Partial<PlacementRecord<{ url: string }>>): PlacementRecord<{ url: string }> => ({
    id: 1, zone: 'story.inline', kind: 'sponsor', sponsor: 'Acme', enabled: true, href: 'https://acme.example/', alt: 'Acme', image: { url: '/a.png', mimeType: 'image/png' } as never, order: 1, ...over,
  })
  const NOW = new Date('2026-11-20T18:00:00Z')
  const story = storyPage({ section: { id: 3 }, categories: [{ id: 7 }], contributors: [9] })

  it('says a story is its section, topics and reporters', () => {
    expect(story).toEqual({ page: 'story', sectionId: 3, topicIds: [7], personIds: [9] })
    expect(storyPage({})).toEqual({ page: 'story', sectionId: null, topicIds: [], personIds: [] })
  })
  it('runs a placement on the stories in a section, topic or reporter it chose, and nowhere else', () => {
    expect(resolveZone('story.inline', story, [rec({ scope: 'chosen', sections: [3] })], NOW)).toHaveLength(1)
    expect(resolveZone('story.inline', story, [rec({ scope: 'chosen', topics: [7] })], NOW)).toHaveLength(1)
    expect(resolveZone('story.inline', story, [rec({ scope: 'chosen', people: [9] })], NOW)).toHaveLength(1)
    expect(resolveZone('story.inline', story, [rec({ scope: 'chosen', sections: [4] })], NOW)).toEqual([])
    expect(resolveZone('story.inline', story, [rec({ scope: 'chosen', includeLatest: true })], NOW)).toEqual([])
    expect(resolveZone('story.inline', story, [rec({ scope: 'all' })], NOW)).toHaveLength(1)
  })
  it('does not run a story zone on a list or the home page, or a list zone on a story', () => {
    expect(resolveZone('story.inline', { page: 'home' }, [rec({ scope: 'all' })], NOW)).toEqual([])
    expect(resolveZone('story.inline', { page: 'list', kind: 'section', id: 3 }, [rec({ scope: 'all' })], NOW)).toEqual([])
    expect(resolveZone('list.rail', story, [rec({ zone: 'list.rail', scope: 'all' })], NOW)).toEqual([])
  })
  it('holds two inline bands, in run order', () => {
    const many = [1, 2, 3].map((i) => rec({ id: i, order: i, scope: 'all' }))
    expect(resolveZone('story.inline', story, many, NOW).map((t) => t.key)).toEqual(['story.inline.1', 'story.inline.2'])
  })
})
