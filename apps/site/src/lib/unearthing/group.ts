// What the Unearthing Florida hub derives from its episodes: how many fall in each period, which collections they form and
// how many belong to each site. Pure: no database, so every rule is tested without one. Counts are real counts; a period or
// site with none says so rather than showing a placeholder.

import { PERIODS, type Era } from './periods'

export interface EpisodeRef {
  id: string | number
  title: string
  path: string | null
  publishedAt: string | null
  period: string | null
  siteId: string | number | null
  series: { id: string | number; title: string; slug: string | null } | null
}

export interface SiteRef {
  id: string | number
  name: string
  short: string
  place: string
  era: Era
  description: string | null
  /** Position on the schematic map, 0 to 100 from the top left. */
  x: number
  y: number
}

export const episodeCount = (n: number): string => (n === 0 ? 'No episodes yet' : n === 1 ? '1 episode' : `${n} episodes`)

/** One row per period, in time order, with how many episodes are filed under it. */
export function periodCounts(episodes: readonly EpisodeRef[]) {
  return PERIODS.map((p) => ({ ...p, count: episodes.filter((e) => e.period === p.value).length }))
}

export interface EpisodeCollection {
  id: string | number
  title: string
  slug: string | null
  /** Oldest first: a collection is heard in the order it was told. */
  episodes: EpisodeRef[]
}

/** The series the episodes belong to, largest first (ties by title), episodes oldest first. Episodes with no series are left out. */
export function collectionsOf(episodes: readonly EpisodeRef[]): EpisodeCollection[] {
  const byId = new Map<string, EpisodeCollection>()
  for (const e of episodes) {
    if (!e.series) continue
    const key = String(e.series.id)
    const c = byId.get(key) ?? { id: e.series.id, title: e.series.title, slug: e.series.slug, episodes: [] }
    c.episodes.push(e)
    byId.set(key, c)
  }
  const time = (e: EpisodeRef) => (e.publishedAt ? Date.parse(e.publishedAt) : 0)
  for (const c of byId.values()) c.episodes.sort((a, b) => time(a) - time(b) || a.title.localeCompare(b.title))
  return [...byId.values()].sort((a, b) => b.episodes.length - a.episodes.length || a.title.localeCompare(b.title))
}

/** Each site with the episodes filed under it, in the order the sites were given. */
export function sitesWithEpisodes(sites: readonly SiteRef[], episodes: readonly EpisodeRef[]) {
  return sites.map((s) => {
    const mine = episodes.filter((e) => e.siteId !== null && String(e.siteId) === String(s.id))
    return { ...s, episodes: mine, count: mine.length }
  })
}

/** Keep a map position inside the map; a bad number from the CMS must not push a pin off the edge. */
export const clampPercent = (n: number): number => (Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 50)
