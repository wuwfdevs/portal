// Whether two placements would share a place that is sold to one sponsor at a time. Pure.
//
// A zone marked `exclusive` (a top unit) belongs to one sponsor for a stretch of dates, so the admin refuses a second placement whose dates overlap one already
// booked in the same place and aimed at the same page. Judged on calendar days (both ends inclusive; an end left empty never ends), as the resolver judges them.
// A zone that holds several (the rail) is not checked here: it has a capacity, which is a count and not a calendar.

import { withinDates } from './pick'
import { ZONES, type ZoneId } from './registry'

type Ref = string | number | { id: string | number } | null | undefined
const ids = (list: readonly Ref[] | null | undefined): Set<string> => new Set((list ?? []).flatMap((r) => (r == null ? [] : [String(typeof r === 'object' ? r.id : r)])))

export interface BookedPlacement {
  id?: string | number | null
  name?: string | null
  zone?: string | null
  enabled?: boolean | null
  runFrom?: string | null
  runUntil?: string | null
  scope?: 'all' | 'chosen' | null
  sections?: readonly Ref[] | null
  topics?: readonly Ref[] | null
  people?: readonly Ref[] | null
  includeLatest?: boolean | null
}

const day = (value: string | null | undefined): string | null => {
  const m = typeof value === 'string' ? /^(\d{4}-\d{2}-\d{2})/.exec(value) : null
  return m ? m[1]! : null
}

/** Whether two date ranges share a day. An empty start has begun and an empty end never ends. */
export function datesOverlap(a: Pick<BookedPlacement, 'runFrom' | 'runUntil'>, b: Pick<BookedPlacement, 'runFrom' | 'runUntil'>): boolean {
  const aFrom = day(a.runFrom)
  const aUntil = day(a.runUntil)
  const bFrom = day(b.runFrom)
  const bUntil = day(b.runUntil)
  // a starts after b ends, or b starts after a ends: no shared day.
  if (aFrom && bUntil && aFrom > bUntil) return false
  if (bFrom && aUntil && bFrom > aUntil) return false
  return true
}

/** Whether two placements in an aimed zone can be drawn on the same page: "every page" meets anything; otherwise they must name a page in common. */
export function targetsOverlap(a: BookedPlacement, b: BookedPlacement): boolean {
  if (a.scope === 'all' || b.scope === 'all') return true
  const share = (x: Set<string>, y: Set<string>) => [...x].some((v) => y.has(v))
  return (
    share(ids(a.sections), ids(b.sections)) ||
    share(ids(a.topics), ids(b.topics)) ||
    share(ids(a.people), ids(b.people)) ||
    (a.includeLatest === true && b.includeLatest === true)
  )
}

/**
 * The booked placements this one would share a place with: the same exclusive zone, both switched on, dates that overlap, and (in an aimed zone) a page in common.
 * Empty for a zone that is not exclusive, for a placement that is switched off or has already ended, and when nothing clashes.
 */
export function exclusiveConflicts(candidate: BookedPlacement, booked: readonly BookedPlacement[], today: string): BookedPlacement[] {
  const zone = candidate.zone as ZoneId | undefined
  const spec = zone && Object.prototype.hasOwnProperty.call(ZONES, zone) ? ZONES[zone] : null
  if (!spec?.exclusive || candidate.enabled === false) return []
  // A placement whose last day has passed is no longer booking anything.
  if (!withinDates({ runUntil: candidate.runUntil }, today)) return []
  return booked.filter((other) => {
    if (other.zone !== candidate.zone || other.enabled === false) return false
    if (candidate.id != null && other.id != null && String(candidate.id) === String(other.id)) return false
    if (!withinDates({ runUntil: other.runUntil }, today)) return false
    if (!datesOverlap(candidate, other)) return false
    return spec.targetable ? targetsOverlap(candidate, other) : true
  })
}

/** "Dec. 1 to Dec. 7", "from Dec. 1", "until Dec. 7" or "every day", for the message that names the clash. */
export function describeDates(p: Pick<BookedPlacement, 'runFrom' | 'runUntil'>): string {
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
  const from = day(p.runFrom)
  const until = day(p.runUntil)
  if (from && until) return `${fmt(from)} to ${fmt(until)}`
  if (from) return `from ${fmt(from)}`
  if (until) return `until ${fmt(until)}`
  return 'every day'
}
