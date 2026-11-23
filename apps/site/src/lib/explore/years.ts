// The Explore block's year model and time window. Pure: no React, no Payload. Years are signed integers (negative is BCE, no year 0; see `period-years.ts`).

import { periodYears } from './period-years'

/** A stored year is a whole number other than 0, within what the window's scale can show. */
export function validYear(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value !== 0 && value >= -10000 && value <= 3000
}

/** Payload field validator for a year: empty is fine; otherwise a whole number other than 0 from -10000 (10,000 BCE) to 3000. */
export const validateYear = (value: number | null | undefined): true | string => {
  if (value === undefined || value === null) return true
  return validYear(value) ? true : 'A year is a whole number from -10000 to 3000, with no year 0 (use -1 for 1 BCE and 1 for 1 CE). Negative is BCE.'
}

/** "1513", "1000 BCE", "1 CE": a CE year under 1000 says so, so a bare small number is never read as a count. */
export function formatYear(year: number): string {
  if (year < 0) return `${(-year).toLocaleString('en-US')} BCE`
  return year < 1000 ? `${year} CE` : String(year)
}

/** "1513 – 1821", "5000 BCE – 1000 BCE", or the one year when the two are the same. */
export function formatSpan(from: number, to: number): string {
  return from === to ? formatYear(from) : `${formatYear(from)} – ${formatYear(to)}`
}

export interface YearSpan {
  from: number
  to: number
}

/**
 * The years an episode stands for: its own start and end, else the span of its period, else nothing (an episode with neither is on the map and in the list but is never filtered out
 * by the window). A start after the end is read the other way round, so a typing slip never hides an episode.
 */
export function episodeSpan(ep: { yearStart?: unknown; yearEnd?: unknown; period?: unknown }): YearSpan | null {
  const a = validYear(ep.yearStart) ? ep.yearStart : null
  const b = validYear(ep.yearEnd) ? ep.yearEnd : null
  if (a !== null || b !== null) {
    const start = a ?? (b as number)
    const end = b ?? (a as number)
    return { from: Math.min(start, end), to: Math.max(start, end) }
  }
  const p = periodYears(typeof ep.period === 'string' ? ep.period : null)
  return p ? { from: p[0], to: p[1] } : null
}

/** Whether a span overlaps the window (both ends included). An episode with no span is always in it. */
export function inWindow(span: YearSpan | null, window: YearSpan): boolean {
  return span === null || (span.from <= window.to && span.to >= window.from)
}

/**
 * The window's scale: three stretches of different grain, because the record is lopsided (ten thousand years of Native history in a handful of episodes, five hundred years of
 * colonial and state history in most of them). Changes at 1000 BCE and at 1500. Each stretch owns a share of the track's width and a step in years, so a handle moves by 500 years
 * on the left, by 25 in the middle, and by one year on the right.
 */
export interface ScaleStretch {
  from: number
  to: number
  step: number
  /** The share of the track this stretch takes, 0 to 1; the shares add up to 1. */
  share: number
}

export function scaleFor(thisYear: number): readonly ScaleStretch[] {
  return [
    { from: -10000, to: -1000, step: 500, share: 0.2 },
    { from: -1000, to: 1500, step: 25, share: 0.3 },
    { from: 1500, to: Math.max(1501, thisYear), step: 1, share: 0.5 },
  ]
}

/** A year's place on the track, 0 (left) to 1 (right). Years outside the scale sit at its ends. */
export function positionOf(scale: readonly ScaleStretch[], year: number): number {
  let used = 0
  for (const s of scale) {
    if (year <= s.to) return used + s.share * Math.min(1, Math.max(0, (year - s.from) / (s.to - s.from)))
    used += s.share
  }
  return 1
}

const noZero = (year: number): number => (year === 0 ? 1 : year)

/**
 * Every year a handle may rest on, ascending: each stretch's grid (its `from`, then every `step`), the first year of the next stretch, and no year 0 (the grid's 0 is 1 CE). About
 * six hundred and fifty years in all, so snapping and stepping are a search in a short list.
 */
export function allowedYears(scale: readonly ScaleStretch[]): number[] {
  const years = new Set<number>()
  for (const s of scale) {
    for (let y = s.from; y < s.to; y += s.step) years.add(noZero(y))
    years.add(noZero(s.to))
  }
  return [...years].sort((a, b) => a - b)
}

/** The allowed year nearest to `year` (the earlier one on a tie). */
export function snapYear(allowed: readonly number[], year: number): number {
  let best = allowed[0]!
  for (const y of allowed) if (Math.abs(y - year) < Math.abs(best - year)) best = y
  return best
}

/** The year at a place on the track, snapped to a year the scale offers (so a handle only rests on one). */
export function yearAt(scale: readonly ScaleStretch[], position: number): number {
  const p = Math.min(1, Math.max(0, position))
  let used = 0
  for (const s of scale) {
    if (p <= used + s.share + 1e-9) return snapYear(allowedYears(scale), s.from + ((p - used) / s.share) * (s.to - s.from))
    used += s.share
  }
  return scale[scale.length - 1]!.to
}

/** The next year a handle may rest on, one step either way (`direction` is 1 or -1): one step in the stretch it is in, crossing into the next stretch's grain at its edge. */
export function stepYear(scale: readonly ScaleStretch[], year: number, direction: 1 | -1): number {
  const allowed = allowedYears(scale)
  const at = allowed.indexOf(snapYear(allowed, year))
  return allowed[Math.min(allowed.length - 1, Math.max(0, at + direction))]!
}

/** Ticks for the scale's labels: 10,000 BCE, 1000 BCE, 1 CE, 1500, 1800, and the current year as "Today". */
export function scaleTicks(scale: readonly ScaleStretch[], thisYear: number): Array<{ year: number; label: string; position: number }> {
  const years = [-10000, -1000, 1, 1500, 1800, thisYear]
  return years.map((year) => ({ year, label: year === thisYear ? 'Today' : formatYear(year), position: positionOf(scale, year) }))
}

/**
 * The histogram under the window: how many episodes touch each of `buckets` equal slices of the track. An episode with no span is not counted (it has no place on a timeline).
 * Returns the counts and the tallest, so a view can scale the bars.
 */
export function histogram(spans: ReadonlyArray<YearSpan | null>, scale: readonly ScaleStretch[], buckets: number): { counts: number[]; max: number } {
  const counts = new Array<number>(buckets).fill(0)
  for (const span of spans) {
    if (!span) continue
    const a = Math.min(buckets - 1, Math.max(0, Math.floor(positionOf(scale, span.from) * buckets)))
    const b = Math.min(buckets - 1, Math.max(0, Math.floor(positionOf(scale, span.to) * buckets)))
    for (let i = a; i <= b; i++) counts[i]! += 1
  }
  return { counts, max: Math.max(0, ...counts) }
}
