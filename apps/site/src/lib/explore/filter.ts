// What the reader's choices do to the sites: the time window, the search words and the part of the map in view. Pure.

import type { ExploreEpisode, ExploreSite } from './shape'
import { inWindow, type YearSpan } from './years'

export interface MapBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface SiteInView {
  site: ExploreSite
  /** The episodes that fall in the window. */
  inWindow: ExploreEpisode[]
}

const lower = (s: string): string => s.toLocaleLowerCase('en-US')

/** Whether a site matches the search words: every word is somewhere in its name, place, era or description. No words matches all. */
export function matchesQuery(site: ExploreSite, query: string): boolean {
  const words = lower(query).split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const hay = lower([site.name, site.place, site.era, site.description ?? ''].join(' '))
  return words.every((w) => hay.includes(w))
}

/** Whether a site is in the part of the map in view. A site with no coordinates is always "in view" (it has no place to be out of); no bounds means the whole map. */
export function inBounds(site: ExploreSite, bounds: MapBounds | null): boolean {
  if (!bounds || site.lat === null || site.lng === null) return true
  const lngIn = bounds.west <= bounds.east ? site.lng >= bounds.west && site.lng <= bounds.east : site.lng >= bounds.west || site.lng <= bounds.east
  return lngIn && site.lat >= bounds.south && site.lat <= bounds.north
}

/**
 * The sites to show for the window, the search words and the map's view: each with the episodes that fall in the window. The window filters the sites AND each site's episodes
 * ("2 of 9 episodes fall in 1513 to 1821"): a site none of whose episodes fall in the window is not shown.
 */
export function sitesInView(sites: readonly ExploreSite[], window: YearSpan, query: string, bounds: MapBounds | null): SiteInView[] {
  const out: SiteInView[] = []
  for (const site of sites) {
    if (!matchesQuery(site, query) || !inBounds(site, bounds)) continue
    const inside = site.episodes.filter((e) => inWindow(e.span, window))
    if (inside.length > 0) out.push({ site, inWindow: inside })
  }
  return out
}

export interface SiteFeature {
  type: 'Feature'
  id?: number
  properties: { id: string; name: string; count: number; total: number }
  geometry: { type: 'Point'; coordinates: [number, number] }
}

/** What the map's source is given: one point for each mapped site. */
export interface SitePoints {
  type: 'FeatureCollection'
  features: SiteFeature[]
}

/** The map's points for the sites in the window (those with coordinates): what the map source is given, so the map and the list never disagree. */
export function siteFeatures(visible: readonly SiteInView[]): SitePoints {
  return {
    type: 'FeatureCollection',
    features: visible.flatMap(({ site, inWindow: inside }) =>
      site.lat === null || site.lng === null
        ? []
        : [{ type: 'Feature' as const, id: Number.parseInt(site.id, 10) || undefined, properties: { id: site.id, name: site.name, count: inside.length, total: site.episodes.length }, geometry: { type: 'Point' as const, coordinates: [site.lng, site.lat] as [number, number] } }],
    ),
  }
}

/** "2 of 9 episodes fall in 1513 – 1821", or "4 episodes" when the whole record is in the window. */
export function episodeCountLine(inside: number, total: number, spanLabel: string): string {
  if (inside === total) return `${total} ${total === 1 ? 'episode' : 'episodes'}`
  return `${inside} of ${total} ${total === 1 ? 'episode falls' : 'episodes fall'} in ${spanLabel}`
}

/** The note on a selected site's pin: "2 of 9 episodes in this window", or "4 episodes in this window" when the window holds them all. */
export function inWindowNote(inside: number, total: number): string {
  const word = (n: number) => (n === 1 ? 'episode' : 'episodes')
  return inside === total ? `${total} ${word(total)} in this window` : `${inside} of ${total} ${word(total)} in this window`
}
