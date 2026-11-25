// Turns accepted placement events into additions to the daily totals. Pure.
//
// The zone, kind and sponsor stored are the placement record's, never the browser's: an event whose zone or sponsor does not match the record is
// not counted (a page cached before a placement was moved, or a forged post). A placement that is not switched on is not counted.

import type { PlacementEvent } from './events'

/** What the counter knows about a running placement, from its record. */
export interface KnownPlacement {
  id: string
  zone: string
  kind: 'sponsor' | 'house'
  sponsorId: string | null
}

export interface CountRow {
  day: string
  placementId: number
  zone: string
  kind: 'sponsor' | 'house'
  sponsorId: number | null
  filterVersion: string
  measurable: number
  viewable: number
  clicked: number
}

const FIELD = { sponsor_placement_measurable: 'measurable', sponsor_placement_viewable: 'viewable', sponsor_placement_clicked: 'clicked' } as const

const asInt = (id: string | null): number | null => (id !== null && /^\d{1,10}$/.test(id) ? Number(id) : null)

/** The rows to add for `day`, one per placement, from the events that match a known placement. */
export function tally(events: readonly PlacementEvent[], known: ReadonlyMap<string, KnownPlacement>, day: string, filterVersion: string): CountRow[] {
  const rows = new Map<string, CountRow>()
  for (const event of events) {
    const placement = known.get(event.placement_id)
    if (!placement || placement.zone !== event.zone || placement.kind !== event.kind) continue
    // A WUWF promotion has no sponsor; a sponsor's must name the record's sponsor.
    const sponsorId = placement.kind === 'house' ? null : placement.sponsorId
    if (placement.kind === 'sponsor' && event.sponsor_id !== sponsorId) continue
    const placementId = asInt(placement.id)
    if (placementId === null) continue
    const key = `${placementId}|${placement.zone}`
    const row = rows.get(key) ?? { day, placementId, zone: placement.zone, kind: placement.kind, sponsorId: asInt(sponsorId), filterVersion, measurable: 0, viewable: 0, clicked: 0 }
    row[FIELD[event.name]] += 1
    rows.set(key, row)
  }
  return [...rows.values()]
}
