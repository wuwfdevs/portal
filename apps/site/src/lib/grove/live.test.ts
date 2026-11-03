import { describe, expect, it } from 'vitest'

import { convertLiveBlog } from './live'
import type { JsonObject } from './types'

const T = (name: string) => `/core/${name}.hbs`
const update = (over: JsonObject = {}): JsonObject => ({
  _template: '/liveblog/LiveBlogPost.hbs',
  postId: '000001a1-5fac-d3cd-abaf-dfad99140000',
  anchor: 'diaper-distribution-wednesday-afternoon',
  headline: 'Diaper distribution Wednesday afternoon ',
  body: ['<p>At the church on Navy Blvd.</p>'],
  authors: [],
  postedDate: 'October 21, 2026 at 1:16 PM CDT',
  postedDateTimestamp: '1792606577916',
  updateDate: 'October 21, 2026 at 1:16 PM CDT',
  ...over,
})
const page = (over: JsonObject = {}): JsonObject => ({
  _template: '/liveblog/LiveBlogPage.hbs',
  canonicalLink: 'https://www.wuwf.org/live-updates/tropical-storm-isaias-updates',
  contentId: '000001a1-1710-d3cd-abaf-9f358be60000',
  headline: 'Get updates on recovery efforts after Hurricane Isaias',
  description: 'Recovery news.',
  datePublishedISO: '2026-10-07T16:01:48.854Z',
  dateModifiedISO: '2026-10-19T14:12:31.045Z',
  liveEvent: false,
  jsonLinkedData: '{"@type":"LiveBlogPosting","coverageEndTime":"2026-10-22T18:16:17.916Z"}',
  blogBody: ['<p>What this is.</p>'],
  blogLead: [],
  pinnedPosts: [],
  posts: [update()],
  ...over,
})
const ok = (p: JsonObject) => {
  const r = convertLiveBlog(p)
  if (r.status !== 'converted') throw new Error('expected converted')
  return r
}

describe('convertLiveBlog', () => {
  it('keeps the address, ids, dates and the end of coverage exactly', () => {
    const { blog, report } = ok(page())
    expect(blog).toMatchObject({
      slug: 'tropical-storm-isaias-updates',
      title: 'Get updates on recovery efforts after Hurricane Isaias',
      coverage: 'ended',
      endedAt: '2026-10-22T18:16:17.916Z',
      startedAt: '2026-10-07T16:01:48.854Z',
      legacy: { groveId: '000001a1-1710-d3cd-abaf-9f358be60000', legacyPath: '/live-updates/tropical-storm-isaias-updates', modifiedAt: '2026-10-19T14:12:31.045Z' },
    })
    expect(report.status).toBe('clean')
  })
  it('keeps each update with its exact anchor, id and posted time, and a tidy headline', () => {
    const u = ok(page()).blog.updates[0]!
    expect(u).toMatchObject({ postId: '000001a1-5fac-d3cd-abaf-dfad99140000', anchor: 'diaper-distribution-wednesday-afternoon', headline: 'Diaper distribution Wednesday afternoon', postedAt: new Date(1792606577916).toISOString(), editedAt: null })
    expect(JSON.stringify(u.body)).toContain('At the church on Navy Blvd.')
  })
  it('reads an edited time only when Grove gives a different one, and notes one it cannot read', () => {
    const edited = ok(page({ posts: [update({ updateDate: 'October 22, 2026 at 4:14 PM CDT' })] }))
    expect(edited.blog.updates[0]!.editedAt).toBe('2026-10-22T21:14:00.000Z')
    const odd = ok(page({ posts: [update({ updateDate: 'sometime later' })] }))
    expect(odd.blog.updates[0]!.editedAt).toBeNull()
    expect(odd.report.entries.map((e) => e.code)).toContain('live.edited-time-unreadable')
  })
  it('carries optional bylines, with a profile address when Grove has one', () => {
    const r = ok(page({ posts: [update({ authors: [{ _template: T('link/Link'), body: 'Anthony Potts', href: 'https://www.wuwf.org/people/anthony-potts' }, { _template: T('link/Link'), body: 'News Service of Florida' }] })] }))
    expect(r.blog.updates[0]!.authors).toEqual([{ name: 'Anthony Potts', slug: 'anthony-potts' }, { name: 'News Service of Florida' }])
    expect(r.report.entries.map((e) => e.code)).toContain('byline.person-without-address')
  })
  it('orders updates oldest first, so the importer posts them in the order they happened', () => {
    const r = ok(page({ posts: [update({ postId: 'b', anchor: 'b', postedDateTimestamp: '1792606577916' }), update({ postId: 'a', anchor: 'a', postedDateTimestamp: '1791389730664' })] }))
    expect(r.blog.updates.map((u) => u.anchor)).toEqual(['a', 'b'])
  })
  it('refuses to lose an update: a missing id, anchor, headline or time, or a duplicate, is an exception', () => {
    for (const bad of [update({ postId: '' }), update({ anchor: '' }), update({ headline: '' }), update({ postedDateTimestamp: 'x' })]) {
      expect(convertLiveBlog(page({ posts: [bad] })).report.status).toBe('exception')
    }
    expect(convertLiveBlog(page({ posts: [update(), update()] })).report.status).toBe('exception')
  })
  it('flags pinned updates it does not map, and a blog still marked live', () => {
    expect(ok(page({ pinnedPosts: [update()] })).report.entries.map((e) => e.code)).toContain('live.pinned-not-mapped')
    const live = ok(page({ liveEvent: true }))
    expect(live.blog).toMatchObject({ coverage: 'live', endedAt: null })
  })
  it('does not convert a page that is not a live blog', () => {
    const r = convertLiveBlog({ _template: '/core/article/ArticlePage.hbs', canonicalLink: 'https://www.wuwf.org/x' })
    expect(r.status).toBe('skipped')
  })
})
