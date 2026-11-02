import { describe, expect, it } from 'vitest'

import { addPage, classifyOrigin, discoveryCurve, emptyTally, shouldKeepRaw } from './tally'

const page = (over: Record<string, unknown> = {}) => ({
  _template: 'ArticlePage',
  contentId: '00000190-aaaa',
  sourceOrganizationName: 'WUWF',
  canonicalLink: 'https://www.wuwf.org/local-news/2016-05-02/what-is-a-hospitalist',
  publishedDate: '2016-05-02T15:00:00Z',
  primarySection: { name: 'Local News', path: '/local-news' },
  articleBody: [
    '<p class="cms-textAlign-center">Hello <b>there</b></p><img src="https://npr.brightspotcdn.com/legacy/sites/wuwf/a.jpg">',
    { _type: 'Enhancement', item: { _type: 'Figure', src: 'https://cpa.ds.npr.org/wuwf/a.jpg', caption: 'c' } },
    { _type: 'Enhancement', item: { _type: 'QuoteEnhancement', pullQuote: true, text: 'q' } },
  ],
  ...over,
})

describe('addPage', () => {
  it('counts the page template, every typed object, and distinct shapes', () => {
    const t = emptyTally()
    addPage(t, 'main', '/local-news/2016-05-02/a', page(), { date: '2016-05-02', section: 'local-news' })
    addPage(t, 'main', '/local-news/2016-05-03/b', page({ _template: 'ArticlePage' }), { date: '2016-05-03', section: 'local-news' })
    const g = t.groups['main']!
    expect(g.pages).toBe(2)
    expect(g.templates['ArticlePage']?.count).toBe(2)
    expect(g.typeLabels['Enhancement']?.count).toBe(2) // once per page, not once per occurrence
    expect(g.typeLabels['Figure']?.count).toBe(2)
    expect(g.typeLabels['QuoteEnhancement']?.count).toBe(2)
    const enhancementShapes = Object.values(g.shapes).filter((s) => s.label === 'Enhancement')
    expect(enhancementShapes).toHaveLength(1)
    expect(enhancementShapes[0]?.keys).toEqual({ _type: 'string', item: 'object' })
  })

  it('gives the same label with different keys a different shape', () => {
    const t = emptyTally()
    addPage(t, 'main', '/a', { _template: 'X', body: [{ _type: 'Figure', src: 'a' }, { _type: 'Figure', src: 'a', credit: 'c' }] })
    const figures = Object.values(t.groups['main']!.shapes).filter((s) => s.label === 'Figure')
    expect(figures.map((f) => Object.keys(f.keys).sort().join())).toEqual(['_type,src', '_type,credit,src'].sort())
  })

  it('tallies HTML tags, classes and src hosts from rich text, and URL hosts from plain values', () => {
    const t = emptyTally()
    addPage(t, 'main', '/a', page())
    const g = t.groups['main']!
    expect(Object.keys(g.htmlTags).sort()).toEqual(['b', 'img', 'p'])
    expect(g.htmlClasses).toEqual({ 'cms-textAlign-center': 1 })
    expect(g.urlHosts['npr.brightspotcdn.com']).toBe(1)
    expect(g.urlHosts['cpa.ds.npr.org']).toBe(1)
    expect(g.urlHosts['www.wuwf.org']).toBe(1)
  })

  it('records key paths with array indices removed', () => {
    const t = emptyTally()
    addPage(t, 'main', '/a', page())
    expect(t.groups['main']!.keyPaths['articleBody[].item._type']?.count).toBe(1)
  })

  it('caps examples at three pages', () => {
    const t = emptyTally()
    for (let i = 0; i < 6; i++) addPage(t, 'main', `/p${i}`, page())
    expect(t.groups['main']!.templates['ArticlePage']).toMatchObject({ count: 6, examples: ['/p0', '/p1', '/p2'] })
  })

  it('does not throw on JSON that is not an object, and counts it as having no template', () => {
    const t = emptyTally()
    expect(() => addPage(t, 'main', '/a', [1, 2, 3])).not.toThrow()
    expect(() => addPage(t, 'main', '/b', 'text')).not.toThrow()
    expect(() => addPage(t, 'main', '/c', null)).not.toThrow()
    expect(t.groups['main']!.templates['(no _template)']?.count).toBe(3)
  })

  it('collapses very wide typed objects into one shape instead of one per key set', () => {
    const t = emptyTally()
    const wide = (n: number) => ({ _type: 'Wide', ...Object.fromEntries(Array.from({ length: 70 }, (_, i) => [`k${i + n}`, 1])) })
    addPage(t, 'main', '/a', { x: [wide(0), wide(1000)] })
    expect(Object.values(t.groups['main']!.shapes).filter((s) => s.label === 'Wide')).toHaveLength(1)
  })

  it('keeps separate tallies per group', () => {
    const t = emptyTally()
    addPage(t, 'main', '/a', page())
    addPage(t, 'probe', '/b', page({ _template: 'ContentPage' }))
    expect(Object.keys(t.groups['main']!.templates)).toEqual(['ArticlePage'])
    expect(Object.keys(t.groups['probe']!.templates)).toEqual(['ContentPage'])
  })
})

describe('origin', () => {
  it('uses the canonical host and the organization, never the path', () => {
    expect(classifyOrigin({ organization: 'WUWF', canonicalHost: 'www.wuwf.org' })).toBe('wuwf')
    expect(classifyOrigin({ organization: null, canonicalHost: 'wuwf.org' })).toBe('wuwf')
    expect(classifyOrigin({ organization: 'NPR', canonicalHost: 'www.npr.org' })).toBe('external')
    expect(classifyOrigin({ organization: 'WUWF', canonicalHost: 'www.wfsu.org' })).toBe('external')
  })
  it('calls disagreement and missing signals ambiguous', () => {
    expect(classifyOrigin({ organization: 'NPR', canonicalHost: 'www.wuwf.org' })).toBe('ambiguous')
    expect(classifyOrigin({ organization: 'WUWF', canonicalHost: null })).toBe('ambiguous')
  })
  it('keeps raw JSON for WUWF and unclear pages, not for NPR or wire pages', () => {
    expect(shouldKeepRaw('wuwf')).toBe(true)
    expect(shouldKeepRaw('ambiguous')).toBe(true)
    expect(shouldKeepRaw('external')).toBe(false)
  })
  it('reads the signals out of a page and flags the ambiguous one for review', () => {
    const t = emptyTally()
    const facts = addPage(t, 'main', '/a', page({ canonicalLink: 'https://www.npr.org/2026/06/02/nx-s1-5123456/x', sourceOrganizationName: 'NPR' }))
    expect(facts).toMatchObject({ origin: 'external', canonicalHost: 'www.npr.org', organization: 'NPR', contentId: '00000190-aaaa' })
    expect(t.groups['main']!.origin.withNprId).toBe(1)
    addPage(t, 'main', '/b', page({ sourceOrganizationName: 'Associated Press' }))
    expect(t.groups['main']!.origin.disagreements).toMatchObject({ count: 1, examples: ['/b'] })
  })
})

describe('dates and sections', () => {
  it('tells America/Chicago from UTC: an evening story is dated differently in the two', () => {
    const t = emptyTally()
    // 04:30 UTC on the 13th is 23:30 on the 12th in Central time.
    addPage(t, 'main', '/a', page({ publishedDate: '2026-06-13T04:30:00Z' }), { date: '2026-06-12', section: 'local-news' })
    addPage(t, 'main', '/b', page({ publishedDate: '2026-06-13T04:30:00Z' }), { date: '2026-06-13', section: 'local-news' })
    addPage(t, 'main', '/c', page({ publishedDate: '2026-06-13T15:00:00Z' }), { date: '2026-06-13', section: 'local-news' })
    addPage(t, 'main', '/d', page({ publishedDate: '2026-06-20T15:00:00Z' }), { date: '2026-06-13', section: 'local-news' })
    addPage(t, 'main', '/e', page(), {})
    expect(t.groups['main']!.dates.pathDateMatches).toEqual({ both: 1, 'chicago-only': 1, 'utc-only': 1, neither: 1, unknown: 1 })
    expect(t.groups['main']!.dates.publishedKeys).toEqual({ publishedDate: 5 })
  })

  it('checks the path section against the primary section, and records which key it read', () => {
    const t = emptyTally()
    addPage(t, 'main', '/a', page(), { section: 'local-news' })
    addPage(t, 'main', '/b', page({ primarySection: { name: 'Music & Arts' } }), { section: 'local-news' })
    addPage(t, 'main', '/c', { _template: 'X' }, { section: 'local-news' })
    const s = t.groups['main']!.sections
    expect(s.pathSectionInPrimary).toEqual({ yes: 1, no: 1, unknown: 1 })
    expect(s.primaryKeys).toEqual({ primarySection: 2, '(none found)': 1 })
  })
})

describe('discoveryCurve', () => {
  it('counts how many new templates, type labels and shapes each further 100 pages found', () => {
    const t = emptyTally()
    for (let i = 1; i <= 250; i++) {
      const extra = i === 150 ? [{ _type: 'Gallery', photos: [] }] : []
      addPage(t, 'main', `/p${i}`, { _template: i === 220 ? 'EventPage' : 'ArticlePage', body: [{ _type: 'Figure', src: 'a' }, ...extra] })
    }
    const curve = discoveryCurve(t.groups['main']!)
    expect(curve.map((c) => c.upToPage)).toEqual([100, 200, 250])
    expect(curve[0]).toMatchObject({ templates: 1, labels: 1 }) // ArticlePage, Figure
    expect(curve[1]).toMatchObject({ templates: 0, labels: 1 }) // Gallery
    expect(curve[2]).toMatchObject({ templates: 1, labels: 0 }) // EventPage
  })
})
