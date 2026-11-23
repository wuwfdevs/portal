// Explore's data: the sites an Unearthing page's show has episodes at, each with those episodes and the years they stand for. Pure: stored records in, plain JSON out (a bare id or a
// record that is not what it should be is left out, never trusted). The read is `lib/explore/load.ts`.

import { eraLabel } from '@/lib/unearthing/periods'

import { episodeSpan, type YearSpan } from './years'

export interface ExploreEpisode {
  id: string
  title: string
  href: string | null
  /** The years the episode stands for, or null (it has neither years nor a known period: the window never hides it). */
  span: YearSpan | null
}

export interface ExploreSite {
  id: string
  name: string
  place: string
  /** "Native", "Spanish colonial"... the site's era as the station words it. */
  era: string
  description: string | null
  /** Where it is, or null while the site has no coordinates: it is listed but not on the map. */
  lat: number | null
  lng: number | null
  episodes: ExploreEpisode[]
}

export interface ExploreData {
  sites: ExploreSite[]
  /** Every episode counted once, with or without a site on the map. */
  episodeCount: number
}

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const idOf = (v: unknown): string | null => {
  if (typeof v === 'number' || typeof v === 'string') return String(v)
  const o = obj(v)
  return o && (typeof o.id === 'number' || typeof o.id === 'string') ? String(o.id) : null
}
/** A path on this site, or null. */
const sitePath = (v: unknown): string | null => {
  const p = str(v)
  return p && p.startsWith('/') && !p.startsWith('//') ? p : null
}

/** A latitude or longitude inside its range; anything else (a missing value, text, an out-of-range number) is "no coordinate". */
export const coordinate = (v: unknown, limit: number): number | null => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= limit ? v : null)

/** An episode, or null when it has no title or no site. */
export function exploreEpisode(doc: unknown): (ExploreEpisode & { siteId: string }) | null {
  const p = obj(doc)
  const id = idOf(p?.id)
  const title = str(p?.title)
  const siteId = idOf(p?.site)
  if (!p || id === null || !title || siteId === null) return null
  return { id, title, href: sitePath(p.path), span: episodeSpan({ yearStart: p.yearStart, yearEnd: p.yearEnd, period: p.period }), siteId }
}

/**
 * The sites that have at least one published episode, with their episodes (newest first as given), sorted by name. A pin that leads nowhere is no use to a reader, so a site with no
 * episode is left out. A site with no coordinates stays in, flagged by null coordinates (it is listed, not mapped).
 */
export function shapeExplore(siteDocs: readonly unknown[], episodeDocs: readonly unknown[]): ExploreData {
  const bySite = new Map<string, ExploreEpisode[]>()
  let episodeCount = 0
  for (const doc of episodeDocs) {
    const ep = exploreEpisode(doc)
    if (!ep) continue
    episodeCount += 1
    const { siteId, ...rest } = ep
    bySite.set(siteId, [...(bySite.get(siteId) ?? []), rest])
  }
  const sites: ExploreSite[] = []
  for (const doc of siteDocs) {
    const s = obj(doc)
    const id = idOf(s?.id)
    const name = str(s?.name)
    if (!s || id === null || !name) continue
    const episodes = bySite.get(id)
    if (!episodes || episodes.length === 0) continue
    const lat = coordinate(s.latitude, 90)
    const lng = coordinate(s.longitude, 180)
    sites.push({ id, name, place: str(s.place) ?? '', era: eraLabel(str(s.era)), description: str(s.description), lat: lat !== null && lng !== null ? lat : null, lng: lat !== null && lng !== null ? lng : null, episodes })
  }
  return { sites: sites.sort((a, b) => a.name.localeCompare(b.name)), episodeCount }
}
