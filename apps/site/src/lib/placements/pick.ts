// Which tiles of a placement run today, and how each is labeled. Pure: the loader hands it the tiles the Placements global holds.
//
// A tile runs when it is switched on, today falls inside its dates (judged as a calendar day at the station, in Central time, so a tile set
// to end on the 30th runs through the evening of the 30th), it has a picture to show and its address is one a reader may safely follow.
// Anything else is quietly left out; the rest keep their order, and positions are counted among the tiles that run.

import { supportHref } from '@/lib/support-link'

export interface TileLike {
  kind?: 'sponsor' | 'house' | null
  sponsor?: string | null
  enabled?: boolean | null
  /** A date, as the admin stores it. Only its calendar day counts. */
  runFrom?: string | null
  runUntil?: string | null
  href?: string | null
  alt?: string | null
  /** Populated media, or null/an id when it was not loaded or no longer exists. */
  image?: unknown
}

/** Today's date at the station (America/Chicago), as `YYYY-MM-DD`. */
export function stationDay(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const dayOf = (value: string | null | undefined): string | null => {
  const m = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null
  return m ? m[1]! : null
}

/** Whether today falls within a tile's dates (both ends inclusive; an end left empty never ends, a start left empty has begun). */
export function withinDates(tile: Pick<TileLike, 'runFrom' | 'runUntil'>, today: string): boolean {
  const from = dayOf(tile.runFrom)
  const until = dayOf(tile.runUntil)
  if (from && today < from) return false
  if (until && today > until) return false
  return true
}

const hasPicture = (image: unknown): boolean => Boolean(image) && typeof image === 'object' && 'url' in (image as object) && Boolean((image as { url?: unknown }).url)

/** The tiles that run, in the order the admin lists them, at most `max`. */
export function liveTiles<T extends TileLike>(tiles: readonly T[] | null | undefined, now: Date, max: number): T[] {
  const today = stationDay(now)
  return (tiles ?? [])
    .filter((t) => t.enabled !== false && withinDates(t, today) && hasPicture(t.image) && supportHref(t.href) !== null)
    .slice(0, Math.max(0, max))
}

/** The words above a tile. A sponsor tile always says so; a house promotion carries no label. */
export function tileLabel(tile: Pick<TileLike, 'kind'>): string | null {
  return tile.kind === 'house' ? null : 'Sponsor message'
}

/** What a screen reader hears for the tile's link: what the artwork says, else the sponsor's name. */
export function tileAccessibleName(tile: Pick<TileLike, 'alt' | 'sponsor'>): string {
  return tile.alt?.trim() || tile.sponsor?.trim() || 'Sponsor message'
}

/** Whether a link leaves this site. A sponsor's link says so to search engines and carries no referrer. */
export const isOffSite = (href: string): boolean => !href.startsWith('/')

/** The `rel` of a tile's link: sponsor links are marked `sponsored`; anything leaving the site never passes the page along. */
export function tileRel(tile: Pick<TileLike, 'kind'>, href: string): string | undefined {
  const parts = [tile.kind === 'house' ? null : 'sponsored', isOffSite(href) ? 'noopener' : null, isOffSite(href) ? 'noreferrer' : null].filter(Boolean)
  return parts.length ? parts.join(' ') : undefined
}
