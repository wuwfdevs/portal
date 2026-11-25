// The delivery report for one placement or one sponsor: totals per placement and per day, from the daily counts. Pure.
//
// Two audiences. Staff see every figure as counted. A sponsor's export (`sponsorCsv`) hides any figure under `MIN_REPORTED` ("fewer than 10"),
// so a small count is never presented as more exact than it is, and it prints the definitions and the traffic filter it was counted under.
// Every measure here is the site's own, not an audited one, and the report says so (`ANALYTICS.md`, "Definitions").
//
// This is delivery as the site saw it. The formal proof of performance for a contract (with the on-air affidavit and the contract's commitment)
// is the Portal's: it can read these totals through a signed contract when that is built.

import { ZONES, type ZoneId } from '@/lib/placements/registry'

import { FILTER_RULES, FILTER_VERSION } from './filter'
import { VIEWABLE_MS, VIEWABLE_RATIO } from './viewability'

export const MIN_REPORTED = 10
/** The longest range a report covers, in days. */
export const MAX_RANGE_DAYS = 400

export interface CountLike {
  day: string
  placementId: number
  zone: string
  measurable: number
  viewable: number
  clicked: number
  filterVersion: string
}

export interface Totals {
  measurable: number
  viewable: number
  clicked: number
}

export interface PlacementTotals extends Totals {
  placementId: number
  name: string
  zone: string
  /** Where on the site, in words. */
  place: string
}

export interface DeliveryReport {
  from: string
  to: string
  placements: PlacementTotals[]
  days: ({ day: string } & Totals)[]
  total: Totals
  filterVersions: string[]
}

const DAY = /^\d{4}-\d{2}-\d{2}$/

/** A valid station day, `YYYY-MM-DD`, or null. */
export function dayOrNull(value: string | null | undefined): string | null {
  if (!value || !DAY.test(value)) return null
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value ? null : value
}

/** `day` moved by `n` days. */
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The range asked for, or the 30 days ending `today`. Refuses a reversed or over-long range. */
export function reportRange(from: string | null, to: string | null, today: string): { from: string; to: string } | { error: string } {
  const end = dayOrNull(to) ?? today
  const start = dayOrNull(from) ?? addDays(end, -29)
  if (start > end) return { error: 'The first day is after the last day.' }
  if ((Date.parse(end) - Date.parse(start)) / 86_400_000 + 1 > MAX_RANGE_DAYS) return { error: `A report covers at most ${MAX_RANGE_DAYS} days.` }
  return { from: start, to: end }
}

const placeOf = (zone: string): string => (Object.prototype.hasOwnProperty.call(ZONES, zone) ? ZONES[zone as ZoneId].name : zone)
const add = (a: Totals, b: Totals): Totals => ({ measurable: a.measurable + b.measurable, viewable: a.viewable + b.viewable, clicked: a.clicked + b.clicked })
const ZERO: Totals = { measurable: 0, viewable: 0, clicked: 0 }

/** The report over the counts, with each placement's name (`names`, by placement id; a deleted placement is named by its id). */
export function buildReport(counts: readonly CountLike[], names: ReadonlyMap<number, string>, from: string, to: string): DeliveryReport {
  const byPlacement = new Map<string, PlacementTotals>()
  const byDay = new Map<string, Totals>()
  const versions = new Set<string>()
  let total = ZERO
  for (const c of counts) {
    const key = `${c.placementId}|${c.zone}`
    const p = byPlacement.get(key) ?? { placementId: c.placementId, name: names.get(c.placementId) ?? `Placement ${c.placementId} (deleted)`, zone: c.zone, place: placeOf(c.zone), ...ZERO }
    byPlacement.set(key, { ...p, ...add(p, c) })
    byDay.set(c.day, add(byDay.get(c.day) ?? ZERO, c))
    versions.add(c.filterVersion)
    total = add(total, c)
  }
  // Every day of the range, so a day with nothing counted shows as nothing, not as missing.
  const days: DeliveryReport['days'] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push({ day: d, ...(byDay.get(d) ?? ZERO) })
  return { from, to, placements: [...byPlacement.values()].sort((a, b) => a.name.localeCompare(b.name) || a.zone.localeCompare(b.zone)), days, total, filterVersions: [...versions].sort() }
}

/** A share as a percentage with one decimal, or an empty string when the base is zero. */
export const percent = (part: number, whole: number): string => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '')

/** A figure as a sponsor's export prints it. */
export const sponsorFigure = (n: number): string => (n === 0 ? '0' : n < MIN_REPORTED ? `fewer than ${MIN_REPORTED}` : String(n))

export const DEFINITIONS: readonly string[] = [
  'Shown: the message was on a page a person opened and the page could see it (the page itself is cached, so this is counted by the page, not the server).',
  `Viewed: at least ${VIEWABLE_RATIO * 100}% of the message was on screen, in a tab the person was looking at, for at least ${VIEWABLE_MS / 1000} continuous second; once per page view.`,
  'Clicked: a person clicked, tapped or middle-clicked the message\'s link.',
  'These are WUWF\'s own measures, modelled on the common display standard. They are not audited by a third party.',
  'Nothing about the people who saw the message is collected: no cookie, no identifier, no address. Each figure is a daily total.',
]

const cell = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const line = (values: readonly string[]): string => values.map(cell).join(',')

/** The sponsor's export: a heading, the definitions and filter, then a total per placement and per day. Figures under `MIN_REPORTED` are hidden. */
export function sponsorCsv(report: DeliveryReport, title: string): string {
  const fig = sponsorFigure
  const rate = (part: number, whole: number) => (whole >= MIN_REPORTED && part >= MIN_REPORTED ? percent(part, whole) : '')
  const rows: string[][] = [
    [title],
    [`${report.from} to ${report.to} (station days, Central time)`],
    [],
    ['How these are counted'],
    ...DEFINITIONS.map((d) => [d]),
    [`Figures under ${MIN_REPORTED} are shown as "fewer than ${MIN_REPORTED}".`],
    [`Counted under traffic filter ${report.filterVersions.join(', ') || '(nothing counted)'}. The current filter (${FILTER_VERSION}):`],
    ...FILTER_RULES.map((r) => [r]),
    [],
    ['Message', 'Place on the site', 'Shown', 'Viewed', 'Clicked', 'Viewed of shown', 'Clicked of viewed'],
    ...report.placements.map((p) => [p.name, p.place, fig(p.measurable), fig(p.viewable), fig(p.clicked), rate(p.viewable, p.measurable), rate(p.clicked, p.viewable)]),
    ['Total', '', fig(report.total.measurable), fig(report.total.viewable), fig(report.total.clicked), rate(report.total.viewable, report.total.measurable), rate(report.total.clicked, report.total.viewable)],
    [],
    ['Day', 'Shown', 'Viewed', 'Clicked'],
    ...report.days.map((d) => [d.day, fig(d.measurable), fig(d.viewable), fig(d.clicked)]),
  ]
  return rows.map(line).join('\r\n') + '\r\n'
}
