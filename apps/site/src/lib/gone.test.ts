import { describe, expect, it } from 'vitest'

import { GONE_HTML, PREVIEW_COOKIE, isGoneCandidate, recordPathOf } from './gone'

describe('isGoneCandidate', () => {
  it('is a bare date-and-slug address, with or without a trailing slash', () => {
    expect(isGoneCandidate('/2019-03-04/some-wire-story')).toBe(true)
    expect(isGoneCandidate('/2019-03-04/some-wire-story/')).toBe(true)
  })
  it('is not a section story, a list, a page or anything deeper', () => {
    for (const p of ['/local-news/2026-10-16/a-story', '/show/the-ecominutes/2026-01-02/ep', '/2019-03-04', '/2019-03-04/a/b', '/about', '/', '/tags/storms', '/2019-3-4/x']) {
      expect(isGoneCandidate(p)).toBe(false)
    }
  })
  it('includes the dead show entry', () => {
    expect(isGoneCandidate('/show/14-59')).toBe(true)
    expect(isGoneCandidate('/show/14-59/')).toBe(true)
    expect(isGoneCandidate('/show/14-60')).toBe(false)
  })
})

describe('recordPathOf', () => {
  it('drops a trailing slash and decodes the path the way records store it', () => {
    expect(recordPathOf('/2019-03-04/x/')).toBe('/2019-03-04/x')
    expect(recordPathOf('/2026-11-06/caf%C3%A9')).toBe('/2026-11-06/café')
    expect(recordPathOf('/show/14-59')).toBe('/show/14-59')
  })
  it('is null for a path that cannot be a record, so it goes to the normal route', () => {
    for (const bad of ['/2019-03-04/%E0%A4%A', '/2019-03-04/a%2Fb', '/2019-03-04/..', '/']) expect(recordPathOf(bad), bad).toBeNull()
  })
})

describe('PREVIEW_COOKIE', () => {
  it("is Next's draft-mode cookie", () => {
    expect(PREVIEW_COOKIE).toBe('__prerender_bypass')
  })
})

describe('GONE_HTML', () => {
  it('is plain: no scripts, a title, a way back', () => {
    expect(GONE_HTML).not.toMatch(/<script/i)
    expect(GONE_HTML).toContain('<title>No longer on wuwf.org</title>')
    expect(GONE_HTML).toContain('href="/"')
  })
})
