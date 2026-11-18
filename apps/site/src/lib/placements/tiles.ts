// The tiles of a placement as a screen draws them: the ones that run today, each with its key, label and link. Pure.

import { supportHref } from '@/lib/support-link'

import { liveTiles, tileAccessibleName, tileLabel, tileRel, type TileLike } from './pick'
import { tileKey, ZONES, type ZoneId } from './registry'

export interface StoredTile<M> extends TileLike {
  id?: string | number | null
  image?: M | string | number | null
  phoneImage?: M | string | number | null
}

export interface PlacementTile<M> {
  /** `home.rail.3`: the placement and the tile's place among those that run. */
  key: string
  kind: 'sponsor' | 'house'
  /** "Sponsor message" for a sponsor; null for a house promotion. */
  label: string | null
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
    if (!image || !href) return []
    const kind = t.kind === 'house' ? 'house' : 'sponsor'
    return [
      {
        key: tileKey(placement, i + 1),
        kind,
        label: tileLabel({ kind }),
        sponsor: kind === 'sponsor' ? t.sponsor?.trim() || null : null,
        name: tileAccessibleName(t),
        href,
        rel: tileRel({ kind }, href),
        image,
        phoneImage: loaded(t.phoneImage),
      },
    ]
  })
}
