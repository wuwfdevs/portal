// What runs in a zone on a page. Pure: given the placements editors have made and the page being drawn, it returns the tiles to show. The
// pages call this and nothing else; where the placements come from (the Payload records today, the Portal's bookings later) is the loader's
// business, so the pages never change when the source does.
//
// A placement runs in its zone's pages when: it is switched on and today is within its dates (`pick.ts`), it has a picture and a safe link,
// and, in a zone that can be aimed (the list pages), the page is one it chose. Placements in a zone run in their `order` (lower first), then
// the one made first, up to the zone's capacity; anything past it is simply not shown.

import { FILLER_MAX } from './flow'
import { stationDay, withinDates } from './pick'
import { ZONES, type ZoneId } from './registry'
import { placementTiles, type PlacementTile, type StoredTile } from './tiles'

type Id = string | number
type Ref = Id | { id: Id } | null | undefined

/** The page being drawn. A list page is a section, a topic, a reporter, or the list of every story. */
export type PageContext =
  | { page: 'home' }
  | { page: 'list'; kind: 'section' | 'topic' | 'person' | 'latest'; id: Id | null }
  /** A story, by what it is filed under: a placement aimed at a section, a topic or a reporter runs on the stories in it. */
  | { page: 'story'; sectionId: Id | null; topicIds: readonly Id[]; personIds: readonly Id[] }

export interface PlacementRecord<M> extends StoredTile<M> {
  zone?: string | null
  /** Lower runs first. */
  order?: number | null
  createdAt?: string | null
  /** For a zone on the list pages: every list page, or only those chosen below. */
  scope?: 'all' | 'chosen' | null
  sections?: readonly Ref[] | null
  topics?: readonly Ref[] | null
  people?: readonly Ref[] | null
  /** The all-stories page, `/latest`, is not a section, topic or reporter, so it is chosen by itself. */
  includeLatest?: boolean | null
  /** A WUWF promotion that may complete the home page's foot row (`flow.ts`). Only a house promotion in the home rail counts as one. */
  fillsGaps?: boolean | null
}

/** Whether a record is a gap filler: a house promotion in the home page rail that an editor has marked as able to fill a row. */
export const isFiller = (rec: Pick<PlacementRecord<unknown>, 'zone' | 'kind' | 'fillsGaps'>): boolean => rec.fillsGaps === true && rec.kind === 'house' && rec.zone === 'home.rail'

const idOf = (r: Ref): string | null => (r == null ? null : String(typeof r === 'object' ? r.id : r))
const idSet = (list: readonly Ref[] | null | undefined): Set<string> => new Set((list ?? []).map(idOf).filter((v): v is string => v !== null))

/** Whether a placement is aimed at this page. Only meaningful in a zone that can be aimed; the home page has no targets. */
export function matchesPage<M>(rec: PlacementRecord<M>, ctx: PageContext): boolean {
  if (ctx.page === 'home') return true
  if (rec.scope === 'all') return true
  if (ctx.page === 'story') {
    // "Chosen" aims only at what was chosen, as on a list page. The all-stories page is not a story's page, so that choice never matches here.
    const mine = (chosen: readonly Ref[] | null | undefined, ids: readonly Id[]) => ids.some((id) => idSet(chosen).has(String(id)))
    return (ctx.sectionId !== null && idSet(rec.sections).has(String(ctx.sectionId))) || mine(rec.topics, ctx.topicIds) || mine(rec.people, ctx.personIds)
  }
  // "Chosen" (and anything not stored) aims only at what was chosen: a placement never shows everywhere by accident.
  if (ctx.kind === 'latest') return rec.includeLatest === true
  const id = ctx.id === null ? null : String(ctx.id)
  if (id === null) return false
  const chosen = ctx.kind === 'section' ? rec.sections : ctx.kind === 'topic' ? rec.topics : rec.people
  return idSet(chosen).has(id)
}

const time = (iso: string | null | undefined): number => {
  const t = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
}

/** The order placements run in within a zone: `order`, then the one made first, then by id so the answer never changes between renders. */
export function byRunOrder<M>(a: PlacementRecord<M>, b: PlacementRecord<M>): number {
  return (a.order ?? 100) - (b.order ?? 100) || time(a.createdAt) - time(b.createdAt) || String(a.id ?? '').localeCompare(String(b.id ?? ''))
}

const pageMatchesZone = (zone: ZoneId, ctx: PageContext): boolean => ZONES[zone].page === ctx.page

/** The tiles that run in `zone` on this page `now`, in order, at most the zone's capacity. */
export function resolveZone<M extends { url?: string | null }>(zone: ZoneId, ctx: PageContext, records: readonly PlacementRecord<M>[] | null | undefined, now: Date): PlacementTile<M>[] {
  const spec = ZONES[zone]
  if (!spec.built || !pageMatchesZone(zone, ctx)) return []
  // A gap filler is not one of the zone's tiles: it is held apart (`resolveFillers`), so it never takes a place from a sponsor or counts toward capacity.
  const mine = (records ?? []).filter((r) => r.zone === zone && !isFiller(r) && (!spec.targetable || matchesPage(r, ctx))).sort(byRunOrder)
  return placementTiles(zone, mine, now)
}

/** The promotions that may complete the home page's foot row, in order, as many as a row can ever need. Keyed `home.rail.fill.1`, so they are named apart from the rail's own tiles. */
export function resolveFillers<M extends { url?: string | null }>(records: readonly PlacementRecord<M>[] | null | undefined, now: Date): PlacementTile<M>[] {
  const mine = (records ?? []).filter(isFiller).sort(byRunOrder)
  return placementTiles('home.rail', mine, now)
    .slice(0, FILLER_MAX)
    .map((t, i) => ({ ...t, key: `home.rail.fill.${i + 1}` }))
}

/** Whether a placement can still run: not switched off and not ended, as of today at the station. For counting what a zone holds. */
export function stillRunning(rec: Pick<PlacementRecord<unknown>, 'enabled' | 'runUntil'>, now: Date): boolean {
  return rec.enabled !== false && withinDates({ runUntil: rec.runUntil }, stationDay(now))
}

/** A short line for the admin list: where a placement is aimed, without looking anything up. */
export function describeTarget<M>(rec: PlacementRecord<M>): string {
  const zone = isKnown(rec.zone) ? ZONES[rec.zone as ZoneId] : null
  if (!zone) return 'No zone chosen'
  if (!zone.targetable) return zone.name
  if (rec.scope === 'all') return `${zone.name}: every page`
  const n = (l: readonly Ref[] | null | undefined) => idSet(l).size
  const parts = [
    n(rec.sections) ? `${n(rec.sections)} ${n(rec.sections) === 1 ? 'section' : 'sections'}` : null,
    n(rec.topics) ? `${n(rec.topics)} ${n(rec.topics) === 1 ? 'topic' : 'topics'}` : null,
    n(rec.people) ? `${n(rec.people)} ${n(rec.people) === 1 ? 'reporter' : 'reporters'}` : null,
    rec.includeLatest ? 'all stories' : null,
  ].filter(Boolean)
  return `${zone.name}: ${parts.length ? parts.join(', ') : 'nothing chosen yet'}`
}

const isKnown = (z: string | null | undefined): boolean => typeof z === 'string' && Object.prototype.hasOwnProperty.call(ZONES, z)
