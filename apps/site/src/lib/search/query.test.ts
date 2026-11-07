import { describe, expect, it } from 'vitest'

import { countLine, parseSearchParams, postKind, productionKind, searchHref, searchWhere } from './query'

describe('parseSearchParams', () => {
  it('reads a full address', () => {
    expect(parseSearchParams({ q: ' flood   insurance ', type: 'shows', page: '2' })).toEqual({ q: 'flood insurance', type: 'shows', page: 2 })
  })

  it('falls back to the defaults on anything malformed', () => {
    expect(parseSearchParams({ type: 'admin', page: '-3' })).toEqual({ q: '', type: 'all', page: 1 })
    expect(parseSearchParams({ page: 'abc' }).page).toBe(1)
    expect(parseSearchParams({ q: ['a', 'b'] }).q).toBe('a')
  })

  it('caps the length of a query and the page number', () => {
    expect(parseSearchParams({ q: 'x'.repeat(500) }).q).toHaveLength(100)
    expect(parseSearchParams({ page: '99999' }).page).toBe(50)
  })
})

describe('searchHref', () => {
  it('leaves defaults out', () => {
    expect(searchHref({ q: 'flood', type: 'all', page: 1 })).toBe('/search?q=flood')
    expect(searchHref({})).toBe('/search')
  })

  it('keeps a filter and a page, and encodes the words', () => {
    expect(searchHref({ q: 'a&b c', type: 'video', page: 3 })).toBe('/search?q=a%26b+c&type=video&page=3')
  })
})

describe('searchWhere', () => {
  it('is null for an empty search', () => {
    expect(searchWhere({ q: '', type: 'all' })).toBeNull()
  })

  it('needs every word, in the title or the description', () => {
    expect(searchWhere({ q: 'flood insurance', type: 'all' })).toEqual({
      and: [
        { or: [{ title: { like: 'flood' } }, { 'meta.description': { like: 'flood' } }] },
        { or: [{ title: { like: 'insurance' } }, { 'meta.description': { like: 'insurance' } }] },
      ],
    })
  })

  it('narrows to the filter’s kinds', () => {
    const where = searchWhere({ q: 'mary', type: 'shows' })
    expect(where?.and?.at(-1)).toEqual({ kind: { in: ['episode', 'show', 'program'] } })
  })

  it('uses at most eight words', () => {
    expect(searchWhere({ q: 'a b c d e f g h i j', type: 'all' })?.and).toHaveLength(8)
  })
})

describe('kinds', () => {
  it('classes stories', () => {
    expect(postKind({ format: 'web' })).toBe('story')
    expect(postKind({ format: 'live' })).toBe('live')
    expect(postKind({ format: 'audio', production: 4 })).toBe('episode')
    expect(postKind({ format: 'audio', production: null })).toBe('story')
  })

  it('classes shows and programs', () => {
    expect(productionKind({ kind: 'original' })).toBe('show')
    expect(productionKind({ kind: 'syndicated' })).toBe('program')
  })
})

describe('countLine', () => {
  it('says result or results', () => {
    expect(countLine(1, 'flood')).toBe('1 result for “flood”')
    expect(countLine(0, 'zxqv')).toBe('0 results for “zxqv”')
  })
})
