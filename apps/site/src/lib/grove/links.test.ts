import { describe, expect, it } from 'vitest'

import { applyLinkMap, internalLinks, linkKind, linkPath } from './links'
import * as lex from './lexical'

const body = (...nodes: ReturnType<typeof lex.paragraph>[]) => lex.root(nodes)
const a = (url: string, words: string, newTab = false) => lex.link(url, newTab, [lex.text(words)])
const text = (state: ReturnType<typeof lex.root>) => JSON.stringify(state)

describe('linkPath and linkKind', () => {
  it('reads the path of a link on this site and nothing else', () => {
    expect(linkPath('/2023-08-01/a-story#stream/0')).toBe('/2023-08-01/a-story')
    expect(linkPath('/post/x/?utm=1')).toBe('/post/x')
    expect(linkPath('https://www.npr.org/x')).toBeNull()
    expect(linkPath('//evil.example/x')).toBeNull()
    expect(linkPath('mailto:a@b.org')).toBeNull()
  })
  it('names the kind of page by its exact shape', () => {
    expect(linkKind('/2023-08-01/a-story')).toBe('wire')
    expect(linkKind('/post/delta-forecast')).toBe('legacy-post')
    expect(linkKind('/local-news/2024-08-20/four-takeaways')).toBe('section-story')
    expect(linkKind('/podcast/ecoheroes/2022-04-21/x')).toBe('show-episode')
    expect(linkKind('/radiolive')).toBe('page')
    expect(linkKind('/people/dave-dunwoody')).toBe('page')
  })
})

describe('internalLinks', () => {
  it('lists each own-site path once, from sentences and from link lines, and ignores outside links', () => {
    const state = lex.root([
      lex.paragraph([a('/2023-08-01/a-story', 'one'), a('/2023-08-01/a-story#x', 'again'), a('https://www.npr.org/x', 'npr')]),
      lex.block('b1', 'linkLine', { label: 'Related', linkText: 'T', url: '/post/old-slug' }),
    ])
    expect(internalLinks(state)).toEqual(['/2023-08-01/a-story', '/post/old-slug'])
  })
})

describe('applyLinkMap', () => {
  const state = body(lex.paragraph([lex.text('Read '), a('/2023-08-01/a-story#frag', 'the story', true), lex.text(' and '), a('/radiolive', 'RadioLive')]))

  it('points a mapped link at its new address and leaves every other link alone', () => {
    const r = applyLinkMap(state, { '/2023-08-01/a-story': 'https://www.npr.org/2023/08/01/1/a-story' })
    expect(r.changes).toEqual([{ from: '/2023-08-01/a-story', to: 'https://www.npr.org/2023/08/01/1/a-story' }])
    const links = r.state.root.children[0]!.children as Array<{ type: string; fields?: { url: string; newTab: boolean } }>
    expect(links.filter((n) => n.type === 'link').map((n) => n.fields?.url)).toEqual(['https://www.npr.org/2023/08/01/1/a-story', '/radiolive'])
    expect(links[1]!.fields?.newTab).toBe(true)
  })
  it('removes a link mapped to null and keeps its words', () => {
    const r = applyLinkMap(state, { '/2023-08-01/a-story': null })
    expect(r.changes).toEqual([{ from: '/2023-08-01/a-story', to: null }])
    const t = text(r.state)
    expect(t).toContain('the story')
    expect(t).not.toContain('a-story')
    expect(r.state.root.children[0]!.children).toHaveLength(4)
  })
  it('turns a link line whose target is gone into a plain paragraph of its words, and repoints one that has a new address', () => {
    const line = lex.root([lex.block('b1', 'linkLine', { label: 'Related:', linkText: 'A story', url: '/post/old' })])
    const gone = applyLinkMap(line, { '/post/old': null })
    expect(gone.changes).toEqual([{ from: '/post/old', to: null, line: true }])
    expect(gone.state.root.children[0]).toMatchObject({ type: 'paragraph' })
    expect(text(gone.state)).toContain('Related: A story')
    const moved = applyLinkMap(line, { '/post/old': '/local-news/2020-07-21/new-slug' })
    expect(moved.state.root.children[0]!.fields).toMatchObject({ blockType: 'linkLine', url: '/local-news/2020-07-21/new-slug', linkText: 'A story' })
  })
  it('does not change its input, and an empty map changes nothing', () => {
    const before = text(state)
    applyLinkMap(state, { '/2023-08-01/a-story': null })
    expect(text(state)).toBe(before)
    expect(applyLinkMap(state, {}).changes).toEqual([])
    expect(text(applyLinkMap(state, {}).state)).toBe(before)
  })
})
