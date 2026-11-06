import { describe, expect, it } from 'vitest'

import { checkPath, draftPreviewPath, isReservedPath, localDate, pagePath, pathFromSegments, SECTION_SLUG, storyPath } from './paths'

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
    ['/support', /belongs to the site/],
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
