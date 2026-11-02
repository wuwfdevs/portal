// Which pages the census fetches, and in what order. Pure: it reads lists of paths, never the network.
//
// The order is a seeded, stratified interleave of the whole local-news universe, so that
//   - the first `sampleSize` items are themselves a stratified sample (year x section), and
//   - fetching on past that point extends the sample toward the whole set, never wasting what was fetched.

import { seededShuffle, hashSeed, mulberry32 } from './rng'

/** Sections the ROADMAP (Grove migration, step 3) counts as WUWF-looking. Origin is still decided per page. */
export const LOCAL_SECTIONS = [
  'local-news',
  'commentary',
  'uwf-news',
  'local-arts',
  'unearthing-florida',
  'local-politics',
  'local-elections',
  'local-music',
  'local-economy',
  'local-news-featured',
  'local-music-scene',
] as const

export type PathShape =
  | 'section-story'
  | 'wire-story'
  | 'show-episode'
  | 'show-page'
  | 'event'
  | 'person'
  | 'tag'
  | 'standalone'
  | 'other'

export interface PathInfo {
  shape: PathShape
  section?: string
  date?: string
  year?: number
  slug?: string
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function classifyPath(path: string): PathInfo {
  const seg = path.split('/').filter(Boolean)
  const date = (s: string | undefined) => (s && DATE.test(s) ? s : undefined)
  const yearOf = (d: string) => Number(d.slice(0, 4))

  if (seg.length === 3 && seg[0] === 'community-calendar' && seg[1] === 'event') return { shape: 'event', slug: seg[2] }
  if (seg.length === 2 && seg[0] === 'people') return { shape: 'person', slug: seg[1] }
  if (seg[0] === 'tags' || seg[0] === 'tag') return { shape: 'tag' }
  if (seg[0] === 'show') {
    if (seg.length === 2) return { shape: 'show-page', slug: seg[1] }
    const d = date(seg[2])
    if (seg.length === 4 && d) return { shape: 'show-episode', section: seg[1], date: d, year: yearOf(d), slug: seg[3] }
    return { shape: 'other' }
  }
  if (seg.length === 2) {
    const d = date(seg[0])
    if (d) return { shape: 'wire-story', date: d, year: yearOf(d), slug: seg[1] }
  }
  if (seg.length === 3) {
    const d = date(seg[1])
    if (d) return { shape: 'section-story', section: seg[0], date: d, year: yearOf(d), slug: seg[2] }
  }
  if (seg.length === 1) return { shape: 'standalone', slug: seg[0] }
  return { shape: 'other' }
}

export function isLocalStory(info: PathInfo): boolean {
  return info.shape === 'section-story' && (LOCAL_SECTIONS as readonly string[]).includes(info.section ?? '')
}

/** The text of every <loc> in a sitemap or sitemap index. */
export function extractLocs(xml: string): string[] {
  const out: string[] = []
  for (const m of xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)) out.push(decodeXml(m[1] as string))
  return out
}

function decodeXml(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}

const SITE_HOSTS = new Set(['www.wuwf.org', 'wuwf.org'])

/** A sitemap URL becomes a path with no trailing slash, or null if it is not a page on the site. */
export function toPath(loc: string, extraHosts: readonly string[] = []): string | null {
  let u: URL
  try {
    u = new URL(loc)
  } catch {
    return null
  }
  if (!SITE_HOSTS.has(u.hostname) && !extraHosts.includes(u.hostname)) return null
  const p = u.pathname.length > 1 ? u.pathname.replace(/\/+$/, '') : u.pathname
  return p || '/'
}

/** The sitemap file names (YYYYMM) that can hold section-prefixed stories: 2013 on (the first appear in 2013). */
export function sitemapMonths(loc: string, fromYear = 2013): string | null {
  const m = /sitemap-(\d{4})(\d{2})\.xml$/.exec(loc)
  if (!m) return null
  return Number(m[1]) >= fromYear ? `${m[1]}${m[2]}` : null
}

// ---------------------------------------------------------------------------------------------------------------
// Ordering

export interface SampleRates {
  /** Strata with this many pages or fewer are taken whole. */
  smallStratum: number
  early: { fromYear: number; toYear: number; rate: number }
  lateRate: number
}

export const DEFAULT_RATES: SampleRates = {
  smallStratum: 30,
  early: { fromYear: 2013, toYear: 2016, rate: 0.5 },
  lateRate: 0.2,
}

export function sampleRate(year: number, stratumSize: number, rates: SampleRates = DEFAULT_RATES): number {
  if (stratumSize <= rates.smallStratum) return 1
  return year >= rates.early.fromYear && year <= rates.early.toYear ? rates.early.rate : rates.lateRate
}

export interface OrderedItem {
  path: string
  stratum: string
  /** 1 or less means "inside the stratified sample". */
  t: number
}

export interface Ordering {
  items: OrderedItem[]
  /** How many leading items form the stratified sample. */
  sampleSize: number
  strata: Record<string, { size: number; rate: number; sampled: number }>
}

export function orderUniverse(paths: readonly string[], seed: string, rates: SampleRates = DEFAULT_RATES): Ordering {
  const byStratum = new Map<string, string[]>()
  for (const p of [...new Set(paths)].sort()) {
    const info = classifyPath(p)
    if (!isLocalStory(info) || info.year === undefined) continue
    const key = `${info.year}/${info.section}`
    byStratum.set(key, [...(byStratum.get(key) ?? []), p])
  }

  const tie = mulberry32(hashSeed(`${seed}|tie`))
  const items: OrderedItem[] = []
  const strata: Ordering['strata'] = {}
  const keyed: Array<OrderedItem & { tieBreak: number }> = []

  for (const key of [...byStratum.keys()].sort()) {
    const list = seededShuffle(byStratum.get(key) as string[], `${seed}|${key}`)
    const year = Number(key.slice(0, 4))
    const rate = sampleRate(year, list.length, rates)
    list.forEach((path, k) => {
      keyed.push({ path, stratum: key, t: (k + 1) / (rate * list.length), tieBreak: tie() })
    })
    strata[key] = { size: list.length, rate, sampled: list.filter((_, k) => (k + 1) / (rate * list.length) <= 1 + 1e-9).length }
  }

  keyed.sort((a, b) => a.t - b.t || a.tieBreak - b.tieBreak || (a.path < b.path ? -1 : 1))
  for (const k of keyed) items.push({ path: k.path, stratum: k.stratum, t: k.t })
  const sampleSize = items.filter((i) => i.t <= 1 + 1e-9).length
  return { items, sampleSize, strata }
}

// ---------------------------------------------------------------------------------------------------------------
// The legacy probe: shapes outside "local news stories", a small fixed number of each (owner-approved 2026-11-02)

export interface ProbeQuota {
  name: string
  n: number
  match: (info: PathInfo) => boolean
}

export const PROBE_QUOTAS: readonly ProbeQuota[] = [
  { name: 'wire-story-2004-2012', n: 40, match: (i) => i.shape === 'wire-story' && (i.year ?? 0) <= 2012 },
  { name: 'wire-story-2013-on', n: 30, match: (i) => i.shape === 'wire-story' && (i.year ?? 0) >= 2013 },
  { name: 'standalone', n: 25, match: (i) => i.shape === 'standalone' },
  { name: 'show-episode', n: 15, match: (i) => i.shape === 'show-episode' },
  { name: 'event', n: 10, match: (i) => i.shape === 'event' },
  { name: 'person', n: 10, match: (i) => i.shape === 'person' },
  { name: 'show-page', n: 5, match: (i) => i.shape === 'show-page' },
]

export interface ProbeItem {
  path: string
  stratum: string
}

/** Spread across years (round-robin over seeded-shuffled years) so that "2004-2012" is not all 2012. */
export function pickProbe(paths: readonly string[], seed: string, quotas: readonly ProbeQuota[] = PROBE_QUOTAS): ProbeItem[] {
  const out: ProbeItem[] = []
  const unique = [...new Set(paths)].sort()
  for (const q of quotas) {
    const byYear = new Map<number, string[]>()
    for (const p of unique) {
      const info = classifyPath(p)
      if (!q.match(info)) continue
      const y = info.year ?? 0
      byYear.set(y, [...(byYear.get(y) ?? []), p])
    }
    const years = seededShuffle([...byYear.keys()].sort((a, b) => a - b), `${seed}|probe|${q.name}|years`)
    const lists = years.map((y) => seededShuffle(byYear.get(y) as string[], `${seed}|probe|${q.name}|${y}`))
    let taken = 0
    for (let round = 0; taken < q.n; round++) {
      let any = false
      for (const list of lists) {
        const p = list[round]
        if (p === undefined) continue
        any = true
        if (taken < q.n) {
          out.push({ path: p, stratum: `probe:${q.name}` })
          taken++
        }
      }
      if (!any) break
    }
  }
  return out
}
