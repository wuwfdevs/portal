import { describe, expect, it } from 'vitest'

import { isValidAnchor, slugifyAnchor, uniqueAnchor } from './anchor'
import { jsonLdText, liveBlogSchema, SCHEMA_UPDATE_LIMIT } from './jsonld'
import { formatCentral, parseGroveDate } from './time'

describe('formatCentral', () => {
  it('prints the time of day in Central time and names the zone, daylight or standard', () => {
    expect(formatCentral('2026-10-21T18:16:17.916Z')).toBe('Oct. 21, 2026, 1:16 p.m. CDT')
    expect(formatCentral('2026-01-15T15:05:00Z')).toBe('Jan. 15, 2026, 9:05 a.m. CST')
  })
  it('does not put a full stop after May, and is empty for anything that is not a time', () => {
    expect(formatCentral('2026-05-02T17:00:00Z')).toMatch(/^May 2, 2026/)
    for (const v of [null, undefined, '', 'soon']) expect(formatCentral(v)).toBe('')
  })
})

describe('parseGroveDate', () => {
  it('reads the words Grove prints, in the zone they name', () => {
    expect(parseGroveDate('October 21, 2026 at 1:16 PM CDT')).toBe('2026-10-21T18:16:00.000Z')
    expect(parseGroveDate('November 5, 2024 at 8:39 PM CST')).toBe('2024-11-06T02:39:00.000Z')
    expect(parseGroveDate('April 15, 2025 at 12:13 PM CDT')).toBe('2025-04-15T17:13:00.000Z')
    expect(parseGroveDate('March 3, 2025 at 12:05 AM CST')).toBe('2025-03-03T06:05:00.000Z')
  })
  it('is null for another shape or a zone it does not know, so the caller keeps the exact timestamp instead', () => {
    for (const v of ['February 30, 2026 at 1:16 PM CST', '2026-10-21', 'Oct 21 2026', 'October 21, 2026 at 1:16 PM XYZ', '', null, undefined]) expect(parseGroveDate(v)).toBeNull()
  })
})

describe('anchors', () => {
  it('makes a short, plain slug from a headline', () => {
    expect(slugifyAnchor('Diaper distribution Wednesday afternoon ')).toBe('diaper-distribution-wednesday-afternoon')
    expect(slugifyAnchor("Shelters open at noon: what to bring & where")).toBe('shelters-open-at-noon-what-to-bring-and-where')
    expect(slugifyAnchor('Café déjà vu')).toBe('cafe-deja-vu')
    expect(slugifyAnchor('!!!')).toBe('update')
    expect(slugifyAnchor('x'.repeat(200)).length).toBeLessThanOrEqual(60)
  })
  it('is unique within its blog', () => {
    expect(uniqueAnchor('Road closures', new Set())).toBe('road-closures')
    expect(uniqueAnchor('Road closures', new Set(['road-closures']))).toBe('road-closures-2')
    expect(uniqueAnchor('Road closures', new Set(['road-closures', 'road-closures-2']))).toBe('road-closures-3')
  })
  it('accepts a legacy anchor and refuses one that is not a safe fragment', () => {
    expect(isValidAnchor('don-gaetz-to-return-to-florida-legislature-son-matt-gaetz-easily-wins-re-election')).toBe(true)
    for (const bad of ['', 'Has Space', 'a#b', '-x', 'a/b']) expect(isValidAnchor(bad)).toBe(false)
  })
})

describe('liveBlogSchema', () => {
  const blog = {
    url: 'https://www.wuwf.org/live-updates/storm',
    headline: 'Storm updates',
    startedAt: '2026-10-07T16:01:48.854Z',
    publisherName: 'WUWF Public Media',
    updates: Array.from({ length: 30 }, (_, i) => ({ headline: `Update ${i}`, postedAt: `2026-10-07T16:${String(i).padStart(2, '0')}:00.000Z`, anchor: `update-${i}` })),
  }
  it('lists the newest updates only, each with its own address', () => {
    const s = liveBlogSchema(blog) as { liveBlogUpdate: { headline: string; url: string }[] }
    expect(s.liveBlogUpdate).toHaveLength(SCHEMA_UPDATE_LIMIT)
    expect(s.liveBlogUpdate[0]).toMatchObject({ headline: 'Update 29', url: 'https://www.wuwf.org/live-updates/storm#update-29' })
  })
  it('has an end time only when the blog has ended', () => {
    expect(liveBlogSchema(blog)).not.toHaveProperty('coverageEndTime')
    expect(liveBlogSchema({ ...blog, endedAt: '2026-10-22T18:16:17.916Z' })).toHaveProperty('coverageEndTime', '2026-10-22T18:16:17.916Z')
  })
  it('cannot be broken out of its script tag by a headline', () => {
    const text = jsonLdText(liveBlogSchema({ ...blog, headline: '</script><script>alert(1)</script>', updates: [] }))
    expect(text).not.toContain('</script>')
    expect(JSON.parse(text).headline).toBe('</script><script>alert(1)</script>')
  })
})
