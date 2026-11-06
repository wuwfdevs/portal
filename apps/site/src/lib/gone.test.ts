import { describe, expect, it } from 'vitest'

import { GONE_HTML, isGoneCandidate, recordPathOf } from './gone'

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
  it('drops a trailing slash but leaves the root', () => {
    expect(recordPathOf('/2019-03-04/x/')).toBe('/2019-03-04/x')
    expect(recordPathOf('/')).toBe('/')
  })
})

describe('GONE_HTML', () => {
  it('is plain: no scripts, a title, a way back', () => {
    expect(GONE_HTML).not.toMatch(/<script/i)
    expect(GONE_HTML).toContain('<title>No longer on wuwf.org</title>')
    expect(GONE_HTML).toContain('href="/"')
  })
})
