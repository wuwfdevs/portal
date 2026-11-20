import { describe, expect, it } from 'vitest'

import { resolveZone, type PlacementRecord } from './resolve'
import { splitBody, storyPage } from './story'

const para = (text: string) => ({ type: 'paragraph', children: [{ type: 'text', text }] })
const image = { type: 'block', fields: { blockType: 'mediaBlock' } }
const doc = (children: unknown[]) => ({ root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children } })
const text = (n: number) => Array.from({ length: n }, (_, i) => para(`Paragraph ${i + 1}.`))

describe('splitBody', () => {
  it('splits after the fourth paragraph of a story of at least six, keeping the document\'s settings', () => {
    const out = splitBody(doc(text(8)))!
    expect(out.head.root.children).toHaveLength(4)
    expect(out.tail.root.children).toHaveLength(4)
    expect(out.head.root).toMatchObject({ type: 'root', direction: 'ltr', version: 1 })
    expect(out.tail.root).toMatchObject({ type: 'root', direction: 'ltr', version: 1 })
  })
  it('counts only paragraphs with words, so a picture, an embed or an empty line does not move the band', () => {
    const children = [para('One.'), image, para(''), para('Two.'), para('Three.'), image, para('Four.'), para('Five.'), para('Six.')]
    const out = splitBody(doc(children))!
    expect(out.head.root.children).toHaveLength(7) // up to and including the fourth paragraph with words
    expect(out.tail.root.children).toHaveLength(2)
  })
  it('leaves a short story, or one with no body, without a band', () => {
    expect(splitBody(doc(text(5)))).toBeNull()
    expect(splitBody(doc([image, image, ...text(3)]))).toBeNull()
    expect(splitBody(null)).toBeNull()
    expect(splitBody({} as never)).toBeNull()
  })
})

describe('storyPage and a story\'s placements', () => {
  const rec = (over: Partial<PlacementRecord<{ url: string }>>): PlacementRecord<{ url: string }> => ({
    id: 1, zone: 'story.rail', kind: 'sponsor', sponsor: 'Acme', enabled: true, href: 'https://acme.example/', alt: 'Acme', image: { url: '/a.png', mimeType: 'image/png' } as never, order: 1, ...over,
  })
  const NOW = new Date('2026-11-20T18:00:00Z')
  const story = storyPage({ section: { id: 3 }, categories: [{ id: 7 }], contributors: [9] })

  it('says a story is its section, topics and reporters', () => {
    expect(story).toEqual({ page: 'story', sectionId: 3, topicIds: [7], personIds: [9] })
    expect(storyPage({})).toEqual({ page: 'story', sectionId: null, topicIds: [], personIds: [] })
  })
  it('runs a placement on the stories in a section, topic or reporter it chose, and nowhere else', () => {
    expect(resolveZone('story.rail', story, [rec({ scope: 'chosen', sections: [3] })], NOW)).toHaveLength(1)
    expect(resolveZone('story.rail', story, [rec({ scope: 'chosen', topics: [7] })], NOW)).toHaveLength(1)
    expect(resolveZone('story.rail', story, [rec({ scope: 'chosen', people: [9] })], NOW)).toHaveLength(1)
    expect(resolveZone('story.rail', story, [rec({ scope: 'chosen', sections: [4] })], NOW)).toEqual([])
    expect(resolveZone('story.rail', story, [rec({ scope: 'chosen', includeLatest: true })], NOW)).toEqual([])
    expect(resolveZone('story.rail', story, [rec({ scope: 'all' })], NOW)).toHaveLength(1)
  })
  it('does not run a story zone on a list or the home page, or a list zone on a story', () => {
    expect(resolveZone('story.rail', { page: 'home' }, [rec({ scope: 'all' })], NOW)).toEqual([])
    expect(resolveZone('story.rail', { page: 'list', kind: 'section', id: 3 }, [rec({ scope: 'all' })], NOW)).toEqual([])
    expect(resolveZone('list.rail', story, [rec({ zone: 'list.rail', scope: 'all' })], NOW)).toEqual([])
  })
  it('holds two in the rail and one inline band', () => {
    const many = [1, 2, 3].map((i) => rec({ id: i, order: i, scope: 'all' }))
    expect(resolveZone('story.rail', story, many, NOW)).toHaveLength(2)
    expect(resolveZone('story.inline', story, many.map((m) => ({ ...m, zone: 'story.inline' })), NOW)).toHaveLength(1)
  })
})
