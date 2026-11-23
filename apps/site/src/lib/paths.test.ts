import { describe, expect, it } from 'vitest'

import { checkPath, draftPreviewPath, isReservedPath, localDate, PAGE_SET_FIRST_SEGMENTS, pagePath, pathFromSegments, RADIOLIVE_PAGE_PATHS, RESERVED_FIRST_SEGMENTS, SECTION_SLUG, storyPath } from './paths'

describe('first segments owned by page sets', () => {
  it('let a page take a path there, and keep a section from being named one', () => {
    for (const path of ['/support', '/support/ways', '/sponsor', '/sponsor/on-air', '/podcasts']) expect(checkPath(path), path).toEqual({ ok: true })
    expect([...PAGE_SET_FIRST_SEGMENTS].sort()).toEqual(['podcasts', 'sponsor', 'support'])
    for (const s of PAGE_SET_FIRST_SEGMENTS) expect(RESERVED_FIRST_SEGMENTS.has(s)).toBe(false)
  })
})

describe('checkPath', () => {
  it.each([
    '/local-news/2016-05-02/what-is-a-hospitalist',
    '/2004-06-02/powell-iraq-wont-have-veto-power-over-u-s-troops',
    '/people/ana-tintocalis',
    '/show/14-59/2021-10-05/october-8th-2021',
    '/community-calendar/event/emerald-coast-quilt-show-2027-how-does-your-garden-grow-31-05-2026-09-41-44',
    '/q1232',
    '/wuwf-tv-grid',
    '/café/2020-01-01/été', // Grove's letters are kept as they are
  ])('accepts %s', (p) => {
    expect(checkPath(p)).toEqual({ ok: true })
  })

  it.each([
    ['', /required/],
    [undefined, /required/],
    ['no-leading-slash', /starts with/],
    ['/', /home page/],
    ['/a/', /trailing slash/],
    ['/a//b', /empty segment/],
    ['/a/../b', /"\.\."/],
    ['/a/./b', /"\."/],
    ['/a b', /spaces/],
    ['/a?x=1', /"\?"/],
    ['/a#top', /"#"/],
    ['/a%2Fb', /"%"/],
    ['/a\\b', /\\/],
    ['/a\u0000b', /control/],
    ['/' + 'x'.repeat(600), /at most/],
    ['/search', /belongs to the site/],
    ['/support/2014-10-31/wuwf-corporate-sponsors', /belongs to the site/], // a Grove story redirected to the sponsorship pages: nothing may be imported at it
    ['/admin/anything', /belongs to the site/],
    ['/posts/a-story', /belongs to the site/],
    ['/pages-sitemap.xml', /belongs to the site/],
    ['/sitemaps/posts-1.xml', /belongs to the site/],
    ['/_draft/posts/1', /belongs to the site/],
  ])('rejects %j', (p, reason) => {
    const r = checkPath(p)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toMatch(reason)
  })

  it('knows which paths the site itself owns', () => {
    expect(isReservedPath('/search')).toBe(true)
    expect(isReservedPath('/search-and-rescue')).toBe(false)
    expect(isReservedPath('/sponsor/on-air')).toBe(false) // the sponsorship pages are pages now (phase 3)
    expect(isReservedPath('/sponsor')).toBe(false)
    expect(isReservedPath('/sponsor/inquiry-token')).toBe(true) // the one address inside it that a route owns
    expect(isReservedPath('/local-news/2016-05-02/support')).toBe(false) // only the first segment is reserved
  })
})

describe('pathFromSegments', () => {
  it('joins and decodes segments', () => {
    expect(pathFromSegments(['local-news', '2016-05-02', 'a-story'])).toBe('/local-news/2016-05-02/a-story')
    expect(pathFromSegments(['caf%C3%A9', 'x'])).toBe('/café/x')
  })
  it('is null for nothing, and for anything that cannot be a stored path', () => {
    expect(pathFromSegments(undefined)).toBeNull()
    expect(pathFromSegments([])).toBeNull()
    expect(pathFromSegments(['a', '..', 'b'])).toBeNull()
    expect(pathFromSegments(['a', '%2e%2e', 'b'])).toBeNull() // encoded dots decode to ".."
    expect(pathFromSegments(['a%2Fb'])).toBeNull() // an encoded slash would hide a segment
    expect(pathFromSegments(['%E0%A4%A'])).toBeNull() // malformed encoding does not throw
    expect(pathFromSegments(['a', ''])).toBeNull()
    expect(pathFromSegments(['a b'])).toBeNull()
    expect(pathFromSegments(['x'.repeat(600)])).toBeNull()
  })
  it('does not refuse a reserved path (it is just not found) so a request for one costs no special case', () => {
    expect(pathFromSegments(['support'])).toBe('/support')
  })
})

describe('storyPath', () => {
  it('uses the station\'s date, not UTC: 23:30 on the 12th in Central time is already the 13th in UTC', () => {
    expect(localDate('2026-06-13T04:30:00Z')).toBe('2026-06-12')
    expect(localDate('2026-06-13T04:30:00Z', 'UTC')).toBe('2026-06-13')
    expect(storyPath({ section: 'local-news', publishedAt: '2026-06-13T04:30:00Z', slug: 'a-story' })).toBe('/local-news/2026-06-12/a-story')
  })
  it('follows daylight saving time', () => {
    expect(localDate('2026-01-15T05:30:00Z')).toBe('2026-01-14') // UTC-6
    expect(localDate('2026-07-15T04:30:00Z')).toBe('2026-07-14') // UTC-5
  })
  it('rejects a date that is not one', () => {
    expect(() => localDate('not a date')).toThrow()
  })
  it('makes a path that is itself valid', () => {
    expect(checkPath(storyPath({ section: 'local-news', publishedAt: '2026-06-12T15:00:00Z', slug: 'a-story' }))).toEqual({ ok: true })
  })
})

describe('small helpers', () => {
  it('page paths and draft preview paths', () => {
    expect(pagePath('wake-up')).toBe('/wake-up')
    expect(draftPreviewPath('posts', 12)).toBe('/_draft/posts/12')
  })
  it('a section slug is a safe lowercase segment', () => {
    expect(SECTION_SLUG.test('local-news')).toBe(true)
    for (const bad of ['Local-News', 'local news', 'local--news', '-local', 'local-', 'a/b', '']) expect(SECTION_SLUG.test(bad)).toBe(false)
  })
})

describe('the RadioLive page records (hubs redesign, slice 4)', () => {
  it('allows exactly the page and its artists index, and only when the caller says so', () => {
    expect(checkPath('/radiolive').ok).toBe(false)
    expect(checkPath('/radiolive', { allowPaths: RADIOLIVE_PAGE_PATHS })).toEqual({ ok: true })
    expect(checkPath('/radiolive/artists', { allowPaths: RADIOLIVE_PAGE_PATHS })).toEqual({ ok: true })
  })
  it('keeps a show\'s and an artist\'s address to their routes', () => {
    for (const p of ['/radiolive/some-show', '/radiolive/artists/pat-byrn', '/radiolive/artists/x/y']) expect(checkPath(p, { allowPaths: RADIOLIVE_PAGE_PATHS }).ok, p).toBe(false)
  })
})
