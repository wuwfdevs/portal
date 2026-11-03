// What the community calendar page shows: from a set of events and a request, the entries to list, grouped by day and paged.
// Pure: it takes the events and "now", so it is tested without a database.
//
// Two ways to read the calendar, chosen by whether the visitor picked dates:
//   - no dates: "what's coming up". Each event appears ONCE, at its next date, with a line saying how it repeats. A nightly run
//     does not fill the first pages (Grove's list showed one card per night, seven in a row for one play).
//   - dates picked: "what's on". Every occurrence in the range, day by day.

import {
  addDays,
  describeSchedule,
  expand,
  isDate,
  isUpcoming,
  stationToday,
  type DateString,
  type Occurrence,
  type Schedule,
  type TimeString,
} from './schedule'

export const PAGE_SIZE = 12
export const MAX_KEYWORD = 80
export const MAX_PAGE = 500
/** How far past the start of the window an unbounded read looks. */
export const HORIZON_DAYS = 365

export interface CalendarEvent {
  id: string | number
  path: string
  title: string
  teaser: string | null
  categories: { slug: string; title: string }[]
  schedule: Schedule
  venueName: string | null
  city: string | null
  organizer: string | null
  price: string | null
  free: boolean
}

export interface CalendarQuery {
  categories: string[]
  from: DateString | null
  to: DateString | null
  q: string
  page: number
}

type Params = Record<string, string | string[] | undefined>
const list = (v: string | string[] | undefined): string[] => (Array.isArray(v) ? v : v === undefined ? [] : [v])

/**
 * A request's query string as a clean query. Hostile or malformed values are dropped, never thrown on. Categories may be
 * given by slug (`category=music-classical`) or by Grove's id (`f0=...`, the address the old calendar's filters used).
 */
export function parseCalendarQuery(params: Params, known: readonly { slug: string; groveId?: string | null }[]): CalendarQuery {
  const bySlug = new Set(known.map((k) => k.slug))
  const byGrove = new Map(known.flatMap((k) => (k.groveId ? [[k.groveId, k.slug] as const] : [])))
  const categories = [
    ...new Set([
      ...list(params.category).filter((s) => bySlug.has(s)),
      ...list(params.f0).flatMap((id) => (byGrove.has(id) ? [byGrove.get(id)!] : [])),
    ]),
  ].slice(0, 12)
  const date = (v: string | string[] | undefined): DateString | null => {
    const s = list(v)[0]?.trim()
    return s && isDate(s) ? s : null
  }
  const q = (list(params.q)[0] ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_KEYWORD)
  const pageRaw = Number(list(params.page)[0])
  const page = Number.isInteger(pageRaw) && pageRaw >= 1 ? Math.min(pageRaw, MAX_PAGE) : 1
  let from = date(params.from)
  let to = date(params.to)
  if (from && to && to < from) [from, to] = [to, from]
  return { categories, from, to, q, page }
}

export interface CalendarEntry {
  event: CalendarEvent
  date: DateString
  start: TimeString
  end: TimeString | null
  /** For a recurring event read without dates: how it repeats, in a sentence. */
  repeats: string | null
  /** For the same: how many later dates there are in the window. */
  more: number
}
export interface CalendarDay {
  date: DateString
  entries: CalendarEntry[]
}
export interface CalendarResult {
  days: CalendarDay[]
  total: number
  page: number
  totalPages: number
  /** How many entries each category would have, with every filter but the category one applied. */
  categoryCounts: Record<string, number>
  /** True when dates were picked (every occurrence listed). */
  expanded: boolean
  window: { from: DateString; to: DateString }
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

function matches(e: CalendarEvent, q: string): boolean {
  if (!q) return true
  const hay = norm([e.title, e.teaser, e.venueName, e.city, e.organizer, ...e.categories.map((c) => c.title)].filter(Boolean).join(' '))
  return norm(q).split(' ').every((word) => hay.includes(word))
}

/** The window a query reads: dates picked, or from today for a year. */
export function windowOf(query: Pick<CalendarQuery, 'from' | 'to'>, today: DateString): { from: DateString; to: DateString } {
  const from = query.from ?? today
  const to = query.to ?? addDays(from, HORIZON_DAYS)
  return { from, to }
}

export function buildCalendar(events: readonly CalendarEvent[], query: CalendarQuery, now: Date): CalendarResult {
  const today = stationToday(now)
  const expanded = query.from !== null || query.to !== null
  const window = windowOf(query, today)

  const entries: CalendarEntry[] = []
  for (const event of events) {
    if (!matches(event, query.q)) continue
    const occurrences: Occurrence[] = expand(event.schedule, window).filter((o) => o.date !== today || isUpcoming(o, now))
    if (!occurrences.length) continue
    if (expanded) {
      for (const o of occurrences) entries.push({ event, date: o.date, start: o.start, end: o.end, repeats: null, more: 0 })
    } else {
      const next = occurrences[0]!
      const recurring = event.schedule.kind !== 'once'
      entries.push({ event, date: next.date, start: next.start, end: next.end, repeats: recurring ? describeSchedule(event.schedule) : null, more: recurring ? occurrences.length - 1 : 0 })
    }
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || a.event.title.localeCompare(b.event.title) || String(a.event.id).localeCompare(String(b.event.id)))

  const categoryCounts: Record<string, number> = {}
  for (const e of entries) for (const c of e.event.categories) categoryCounts[c.slug] = (categoryCounts[c.slug] ?? 0) + 1

  const chosen = new Set(query.categories)
  const filtered = chosen.size ? entries.filter((e) => e.event.categories.some((c) => chosen.has(c.slug))) : entries
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const page = Math.min(query.page, totalPages)
  const slice = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const days: CalendarDay[] = []
  for (const entry of slice) {
    const last = days[days.length - 1]
    if (last && last.date === entry.date) last.entries.push(entry)
    else days.push({ date: entry.date, entries: [entry] })
  }
  return { days, total: filtered.length, page, totalPages, categoryCounts, expanded, window }
}

/** The calendar's address for a query, for filter forms, pagination and canonical links. Only what is set appears. */
export function calendarHref(query: Partial<CalendarQuery>, page?: number): string {
  const p = new URLSearchParams()
  for (const c of query.categories ?? []) p.append('category', c)
  if (query.from) p.set('from', query.from)
  if (query.to) p.set('to', query.to)
  if (query.q) p.set('q', query.q)
  const n = page ?? query.page ?? 1
  if (n > 1) p.set('page', String(n))
  const s = p.toString()
  return s ? `/community-calendar?${s}` : '/community-calendar'
}
