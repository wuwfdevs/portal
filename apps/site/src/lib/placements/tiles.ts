// The tiles of a placement as a screen draws them: the ones that run today, each with its key, label and link. Pure.

import type { PlacementRef } from '@/lib/analytics/events'
import { supportHref } from '@/lib/support-link'

import { isStillPicture } from './media'

import { liveTiles, tileAccessibleName, tileLabel, tileRel, type TileLike } from './pick'
import { tileKey, ZONES, type ZoneId } from './registry'

export interface StoredTile<M> extends TileLike {
  id?: string | number | null
  /** The sponsor record's id, for analytics only (the name, `sponsor`, is what a reader sees). */
  sponsorId?: string | null
  image?: M | string | number | null
  phoneImage?: M | string | number | null
}

export interface PlacementTile<M> {
  /** `home.rail.3`: the placement and the tile's place among those that run. */
  key: string
  /** The placement record's id; null only for a tile built without one. Analytics uses it, never a reader. */
  placementId: string | null
  /** The sponsor record's id, for analytics; null for WUWF's own promotion. */
  sponsorId: string | null
  zone: ZoneId
  kind: 'sponsor' | 'house'
  /** "Sponsor message" for a sponsor; "From WUWF" for a house promotion. */
  label: string
  /** The sponsor's name, for a sponsor. */
  sponsor: string | null
  /** What the link is called for a screen reader. */
  name: string
  href: string
  rel: string | undefined
  image: M
  phoneImage: M | null
}

const loaded = <M,>(v: M | string | number | null | undefined): M | null => (v && typeof v === 'object' ? v : null)

/** The tiles that run `now` in a zone, in the order given, at most the zone's capacity. A tile whose picture was not loaded is left out. */
export function placementTiles<M extends { url?: string | null }>(placement: ZoneId, stored: readonly StoredTile<M>[] | null | undefined, now: Date): PlacementTile<M>[] {
  const running = liveTiles(stored, now, ZONES[placement].capacity)
  return running.flatMap((t, i) => {
    const image = loaded(t.image)
    const href = supportHref(t.href)
    // Only still pictures are drawn: a video in the library would otherwise play (the site draws video with autoplay).
    if (!image || !href || !isStillPicture(image as { mimeType?: string | null })) return []
    const kind = t.kind === 'house' ? 'house' : 'sponsor'
    const phone = loaded(t.phoneImage)
    return [
      {
        key: tileKey(placement, i + 1),
        placementId: t.id == null ? null : String(t.id),
        sponsorId: kind === 'sponsor' ? (t.sponsorId ?? null) : null,
        zone: placement,
        kind,
        label: tileLabel({ kind }),
        sponsor: kind === 'sponsor' ? t.sponsor?.trim() || null : null,
        name: tileAccessibleName(t),
        href,
        rel: tileRel({ kind }, href),
        image,
        phoneImage: phone && isStillPicture(phone as { mimeType?: string | null }) ? phone : null,
      },
    ]
  })
}

/** What analytics needs to know about a tile, or null when it has no record id to count against. */
export function tileRef(tile: Pick<PlacementTile<unknown>, 'placementId' | 'sponsorId' | 'zone' | 'kind'>): PlacementRef | null {
  if (!tile.placementId) return null
  return { placement_id: tile.placementId, sponsor_id: tile.sponsorId, zone: tile.zone, kind: tile.kind }
}
