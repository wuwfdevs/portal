import { describe, expect, it } from 'vitest'

import { classifyPath, extractLocs, isLocalStory, orderUniverse, pickProbe, sampleRate, sitemapMonths, toPath, DEFAULT_RATES } from './universe'

const story = (section: string, year: number, i: number) => `/${section}/${year}-03-${String((i % 28) + 1).padStart(2, '0')}/story-${section}-${year}-${i}`

function universe(): string[] {
  const out: string[] = []
  for (let i = 0; i < 100; i++) out.push(story('local-news', 2014, i)) // early years: 50%
  for (let i = 0; i < 100; i++) out.push(story('local-news', 2022, i)) // later years: 20%
  for (let i = 0; i < 12; i++) out.push(story('commentary', 2022, i)) // small stratum: whole
  for (let i = 0; i < 40; i++) out.push(story('florida-news', 2022, i)) // not a local section: never included
  out.push('/2022-01-01/a-wire-story', '/people/someone', '/support')
  return out
}

describe('classifyPath', () => {
  it.each([
    ['/local-news/2016-05-02/what-is-a-hospitalist', { shape: 'section-story', section: 'local-news', year: 2016 }],
    ['/2004-06-02/powell-iraq', { shape: 'wire-story', year: 2004 }],
    ['/show/14-59/2021-10-05/october-8th-2021', { shape: 'show-episode', year: 2021 }],
    ['/show/five-corners', { shape: 'show-page' }],
    ['/community-calendar/event/runge-strings', { shape: 'event' }],
    ['/people/ana-tintocalis', { shape: 'person' }],
    ['/wuwf-tv-grid', { shape: 'standalone' }],
    ['/a/b/c/d/e', { shape: 'other' }],
    ['/local-news/not-a-date/slug', { shape: 'other' }],
  ])('%s', (path, expected) => {
    expect(classifyPath(path)).toMatchObject(expected)
  })

  it('only section stories in the listed sections are local stories', () => {
    expect(isLocalStory(classifyPath('/local-news/2016-05-02/x'))).toBe(true)
    expect(isLocalStory(classifyPath('/music-arts/2026-05-28/x'))).toBe(false)
    expect(isLocalStory(classifyPath('/2016-05-02/x'))).toBe(false)
  })
})

describe('sitemap helpers', () => {
  it('reads <loc> and decodes entities', () => {
    expect(extractLocs('<urlset><url><loc> https://www.wuwf.org/a?x=1&amp;y=2 </loc></url><loc>https://www.wuwf.org/b</loc></urlset>')).toEqual([
      'https://www.wuwf.org/a?x=1&y=2',
      'https://www.wuwf.org/b',
    ])
  })
  it('turns a URL into a path without a trailing slash, and refuses other hosts', () => {
    expect(toPath('https://www.wuwf.org/local-news/2016-05-02/x/')).toBe('/local-news/2016-05-02/x')
    expect(toPath('https://wuwf.org/')).toBe('/')
    expect(toPath('https://www.npr.org/2016/x')).toBeNull()
    expect(toPath('not a url')).toBeNull()
    expect(toPath('http://127.0.0.1:8080/a')).toBeNull()
    expect(toPath('http://127.0.0.1:8080/a', ['127.0.0.1'])).toBe('/a') // only when the caller names the host
  })
  it('keeps monthly sitemaps from 2013 on', () => {
    expect(sitemapMonths('https://www.wuwf.org/sitemap-201310.xml')).toBe('201310')
    expect(sitemapMonths('https://www.wuwf.org/sitemap-201212.xml')).toBeNull()
    expect(sitemapMonths('https://www.wuwf.org/sitemap.xml')).toBeNull()
  })
})

describe('orderUniverse', () => {
  const paths = universe()
  const ord = orderUniverse(paths, 'seed-1')

  it('includes only local-section stories, each once', () => {
    expect(ord.items).toHaveLength(212)
    expect(new Set(ord.items.map((i) => i.path)).size).toBe(212)
    expect(ord.items.some((i) => i.path.includes('florida-news') || i.path.startsWith('/people'))).toBe(false)
  })

  it('applies the sampling rates: whole small strata, 50% early years, 20% later years', () => {
    expect(ord.strata['2022/commentary']).toMatchObject({ size: 12, rate: 1, sampled: 12 })
    expect(ord.strata['2014/local-news']).toMatchObject({ size: 100, rate: 0.5, sampled: 50 })
    expect(ord.strata['2022/local-news']).toMatchObject({ size: 100, rate: 0.2, sampled: 20 })
    expect(ord.sampleSize).toBe(12 + 50 + 20)
  })

  it('makes the leading items the sample, and the rest an extension (A is B plus more)', () => {
    const head = ord.items.slice(0, ord.sampleSize)
    const tail = ord.items.slice(ord.sampleSize)
    expect(head.every((i) => i.t <= 1 + 1e-9)).toBe(true)
    expect(tail.every((i) => i.t > 1)).toBe(true)
    for (const [key, s] of Object.entries(ord.strata)) expect(head.filter((i) => i.stratum === key)).toHaveLength(s.sampled)
  })

  it('is deterministic for a seed and different for another', () => {
    expect(orderUniverse([...paths].reverse(), 'seed-1').items.map((i) => i.path)).toEqual(ord.items.map((i) => i.path))
    expect(orderUniverse(paths, 'seed-2').items.map((i) => i.path)).not.toEqual(ord.items.map((i) => i.path))
  })

  it('spreads each stratum through the order, not clumped at the start', () => {
    const half = ord.items.slice(0, Math.floor(ord.items.length / 2))
    const share = half.filter((i) => i.stratum === '2022/local-news').length
    expect(share).toBeGreaterThan(20) // 100 pages in the stratum; a clumped order would put far fewer or far more here
    expect(share).toBeLessThan(80)
  })

  it('sampleRate follows the configured years', () => {
    expect(sampleRate(2013, 500)).toBe(DEFAULT_RATES.early.rate)
    expect(sampleRate(2016, 500)).toBe(DEFAULT_RATES.early.rate)
    expect(sampleRate(2017, 500)).toBe(DEFAULT_RATES.lateRate)
    expect(sampleRate(2017, 30)).toBe(1)
    expect(sampleRate(2017, 31)).toBe(DEFAULT_RATES.lateRate)
  })
})

describe('pickProbe', () => {
  const wire: string[] = []
  for (let y = 2004; y <= 2012; y++) for (let i = 0; i < 20; i++) wire.push(`/${y}-02-${String(i + 1).padStart(2, '0')}/wire-${y}-${i}`)
  for (let i = 0; i < 50; i++) wire.push(`/2020-02-01/late-${i}`)
  const others = Array.from({ length: 40 }, (_, i) => `/page-${i}`)
  const probe = pickProbe([...wire, ...others, '/people/a', '/people/b'], 's')

  it('fills each quota it can, and no more', () => {
    const n = (name: string) => probe.filter((p) => p.stratum === `probe:${name}`).length
    expect(n('wire-story-2004-2012')).toBe(40)
    expect(n('wire-story-2013-on')).toBe(30)
    expect(n('standalone')).toBe(25)
    expect(n('person')).toBe(2) // only two exist: reports the shortfall by being short, not by padding
    expect(n('event')).toBe(0)
  })

  it('spreads the early wire stories across years', () => {
    const years = new Set(probe.filter((p) => p.stratum === 'probe:wire-story-2004-2012').map((p) => p.path.slice(1, 5)))
    expect(years.size).toBe(9)
  })

  it('is deterministic', () => {
    expect(pickProbe([...wire, ...others], 's')).toEqual(pickProbe([...others, ...wire], 's'))
  })
})
