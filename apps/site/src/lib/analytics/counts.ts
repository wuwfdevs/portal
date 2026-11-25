import { sql } from '@payloadcms/db-postgres'
import type { Payload } from 'payload'

import type { CountRow } from './tally'

/**
 * The only code that touches `placement_counts` (declared in `src/db/placementCounts.ts`). Server only (no `server-only` marker: the Payload CLI
 * loads it through the config, and cannot resolve that package). Queries are parameterised. It adds to
 * daily totals and reads them back; it never stores an event, a visitor or an address.
 */

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: unknown[] }> }
const db = (payload: Payload): Db => (payload.db as unknown as { drizzle: Db }).drizzle

/**
 * Adds each row to its day's totals, making the row if it is the first for that day, placement, zone, sponsor, kind and filter. One statement per
 * row, each atomic. A sponsor or kind that changed during the day starts a row of its own; an existing row's sponsor is never rewritten.
 */
export async function addCounts(payload: Payload, rows: readonly CountRow[]): Promise<void> {
  for (const r of rows) {
    await db(payload).execute(sql`
      INSERT INTO placement_counts (day, placement_id, zone, kind, sponsor_id, filter_version, measurable, viewable, clicked, updated_at)
      VALUES (${r.day}, ${r.placementId}, ${r.zone}, ${r.kind}, ${r.sponsorId}, ${r.filterVersion}, ${r.measurable}, ${r.viewable}, ${r.clicked}, now())
      ON CONFLICT ON CONSTRAINT placement_counts_key DO UPDATE SET
        measurable = placement_counts.measurable + EXCLUDED.measurable,
        viewable = placement_counts.viewable + EXCLUDED.viewable,
        clicked = placement_counts.clicked + EXCLUDED.clicked,
        updated_at = now()`)
  }
}

export interface StoredCount {
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

/** The daily totals for one placement or every placement of one sponsor, between two station days (both inclusive), oldest first. */
export async function readCounts(payload: Payload, filter: { placementId: number } | { sponsorId: number }, from: string, to: string): Promise<StoredCount[]> {
  const who = 'placementId' in filter ? sql`placement_id = ${filter.placementId}` : sql`sponsor_id = ${filter.sponsorId}`
  const result = await db(payload).execute(sql`
    SELECT to_char(day, 'YYYY-MM-DD') AS day, placement_id, zone, kind, sponsor_id, filter_version, measurable, viewable, clicked
    FROM placement_counts
    WHERE ${who} AND day BETWEEN ${from}::date AND ${to}::date
    ORDER BY day, placement_id, zone, kind, sponsor_id NULLS FIRST, filter_version`)
  return ((result.rows ?? []) as Record<string, unknown>[]).map((r) => ({
    day: String(r.day),
    placementId: Number(r.placement_id),
    zone: String(r.zone),
    kind: r.kind === 'house' ? 'house' : 'sponsor',
    sponsorId: r.sponsor_id == null ? null : Number(r.sponsor_id),
    filterVersion: String(r.filter_version),
    measurable: Number(r.measurable),
    viewable: Number(r.viewable),
    clicked: Number(r.clicked),
  }))
}
