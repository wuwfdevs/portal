// The analytics events the site may send, and the one check every event passes before it goes anywhere. Pure.
//
// Only the sponsor placement events are defined so far: they are the first thing measured (`ANALYTICS.md`, "Order of work"). The rest of the
// taxonomy in `ANALYTICS.md` is added here, one event at a time, when something emits it. Events carry opaque ids and fixed words, never titles,
// names, free text or anything about the visitor.

import { ZONES, type ZoneId } from '@/lib/placements/registry'

/** The placement events: the unit was drawn and the page's script could see it, it met the viewable rule (`viewability.ts`), it was clicked. */
export const PLACEMENT_EVENT_NAMES = ['sponsor_placement_measurable', 'sponsor_placement_viewable', 'sponsor_placement_clicked'] as const
export type PlacementEventName = (typeof PLACEMENT_EVENT_NAMES)[number]

/** Which placement an event is about. Every field is an id or a fixed word. */
export interface PlacementRef {
  /** The placement record's id (Sponsorship → Placements). */
  placement_id: string
  /** The sponsor record's id; null for WUWF's own promotion or a placement with no sponsor chosen. */
  sponsor_id: string | null
  zone: ZoneId
  kind: 'sponsor' | 'house'
}

export interface PlacementEvent extends PlacementRef {
  name: PlacementEventName
}

export type AnalyticsEvent = PlacementEvent

/** An id as the database gives it: a number or a short token. Anything longer or with other characters is not an id and is refused. */
const ID = /^[A-Za-z0-9_-]{1,64}$/

const isId = (v: unknown): v is string => typeof v === 'string' && ID.test(v)
const isZone = (v: unknown): v is ZoneId => typeof v === 'string' && Object.prototype.hasOwnProperty.call(ZONES, v)
const PLACEMENT_KEYS = new Set(['name', 'placement_id', 'sponsor_id', 'zone', 'kind'])

/**
 * The event, if it is one the site sends and well formed, else null. Unknown names, unknown or extra fields, a zone that does not exist and an
 * id that is not an id are all refused, so nothing unexpected (a title, a visitor's words) can ride along. The collection endpoint applies the
 * same check to what a browser posts.
 */
export function parseEvent(value: unknown): AnalyticsEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (!(PLACEMENT_EVENT_NAMES as readonly unknown[]).includes(v.name)) return null
  if (Object.keys(v).some((k) => !PLACEMENT_KEYS.has(k))) return null
  if (!isId(v.placement_id) || !isZone(v.zone)) return null
  if (v.sponsor_id !== null && !isId(v.sponsor_id)) return null
  if (v.kind !== 'sponsor' && v.kind !== 'house') return null
  return { name: v.name as PlacementEventName, placement_id: v.placement_id, sponsor_id: v.sponsor_id, zone: v.zone, kind: v.kind }
}

/** The event for a placement, from its reference. */
export const placementEvent = (name: PlacementEventName, ref: PlacementRef): PlacementEvent => ({ name, placement_id: ref.placement_id, sponsor_id: ref.sponsor_id, zone: ref.zone, kind: ref.kind })
