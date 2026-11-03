import { describe, expect, it } from 'vitest'

import { listHref, parseListRequest } from './route'

describe('parseListRequest', () => {
  it('reads a section, a topic and a person, each with its page', () => {
    expect(parseListRequest(['local-news'])).toEqual({ kind: 'section', slug: 'local-news', page: 1 })
    expect(parseListRequest(['local-news', 'page', '3'])).toEqual({ kind: 'section', slug: 'local-news', page: 3 })
    expect(parseListRequest(['tags', 'storms'])).toEqual({ kind: 'topic', slug: 'storms', page: 1 })
    expect(parseListRequest(['tags', 'storms', 'page', '12'])).toEqual({ kind: 'topic', slug: 'storms', page: 12 })
    expect(parseListRequest(['people', 'dave-dunwoody', 'page', '2'])).toEqual({ kind: 'person', slug: 'dave-dunwoody', page: 2 })
  })
  it('is not a list for anything else: a story path, a bare prefix, page 0 or 1, or a bad slug', () => {
    for (const segs of [
      [],
      ['local-news', '2026-10-28', 'a-story'],
      ['tags'],
      ['people'],
      ['local-news', 'page'],
      ['local-news', 'page', '1'],
      ['local-news', 'page', '0'],
      ['local-news', 'page', 'x'],
      ['local-news', 'page', '2', 'extra'],
      ['Local-News'],
      ['tags', 'has space'],
      ['tags', 'a', 'b'],
    ]) expect(parseListRequest(segs), segs.join('/')).toBeNull()
  })
})

describe('listHref', () => {
  it('writes the plain address for page 1 and /page/n after it', () => {
    expect(listHref('section', 'local-news')).toBe('/local-news')
    expect(listHref('section', 'local-news', 1)).toBe('/local-news')
    expect(listHref('topic', 'storms', 2)).toBe('/tags/storms/page/2')
    expect(listHref('person', 'dave-dunwoody', 5)).toBe('/people/dave-dunwoody/page/5')
  })
  it('round-trips with the parser', () => {
    for (const [kind, slug, page] of [['section', 'uwf-news', 4], ['topic', 'storms', 2], ['person', 'a-b', 1]] as const) {
      const href = listHref(kind, slug, page)
      expect(parseListRequest(href.split('/').filter(Boolean))).toEqual({ kind, slug, page })
    }
  })
})
