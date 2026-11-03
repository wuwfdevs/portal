// When an event happens. Pure: no Payload, no Next, no clock (callers pass `now`).
//
// The model mirrors WUWF's community-calendar form (one time, daily, weekly with an interval and several days, monthly by
// weekday) so a submission maps onto it without loss. All times are the station's local time (America/Chicago); a date is
// `YYYY-MM-DD` and a time `HH:MM` (24 hours). A migrated Grove event whose date text cannot be read keeps that text and has
// no occurrences (kind `listed`): it is still served at its address, flagged for a person, never given a guessed date.

export const EVENT_TIME_ZONE = 'America/Chicago'

/** Most occurrences one schedule may produce for a window, and the longest span a recurring schedule may cover. */
export const MAX_OCCURRENCES = 400
export const MAX_SPAN_DAYS = 731

export type DateString = string
export type TimeString = string
/** 0 = Sunday ... 6 = Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type Nth = 1 | 2 | 3 | 4 | 'last'

export type Schedule =
  | { kind: 'once'; date: DateString; start: TimeString; end?: TimeString | null }
  | { kind: 'daily'; startDate: DateString; endDate: DateString; start: TimeString; end: TimeString }
  | {
      kind: 'weekly'
      startDate: DateString
      endDate: DateString
      /** Every N weeks, counted from the week (Sunday to Saturday) of the start date. */
      everyWeeks: number
      slots: { day: Weekday; start: TimeString; end: TimeString }[]
    }
  | {
      kind: 'monthly'
      startDate: DateString
      endDate: DateString
      /** Every N months, counted from the month of the start date. */
      everyMonths: number
      nth: Nth
      day: Weekday
      start: TimeString
      end: TimeString
    }
  /** Dates that could not be read from a migrated page. No occurrences. */
  | { kind: 'listed' }

export interface Occurrence {
  date: DateString
  start: TimeString
  end: TimeString | null
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/

export const isTime = (v: unknown): v is TimeString => typeof v === 'string' && TIME.test(v)

export function parseDate(v: unknown): { y: number; m: number; d: number } | null {
  if (typeof v !== 'string') return null
  const hit = DATE.exec(v)
  if (!hit) return null
  const y = Number(hit[1])
  const m = Number(hit[2])
  const d = Number(hit[3])
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? { y, m, d } : null
}

export const isDate = (v: unknown): v is DateString => parseDate(v) !== null

const ms = (date: DateString): number => {
  const p = parseDate(date)
  if (!p) throw new Error(`Not a date: ${String(date)}`)
  return Date.UTC(p.y, p.m - 1, p.d)
}
const fromMs = (t: number): DateString => new Date(t).toISOString().slice(0, 10)
const DAY = 86_400_000

export const addDays = (date: DateString, n: number): DateString => fromMs(ms(date) + n * DAY)
export const daysBetween = (a: DateString, b: DateString): number => Math.round((ms(b) - ms(a)) / DAY)
export const weekdayOf = (date: DateString): Weekday => new Date(ms(date)).getUTCDay() as Weekday

/** The date of the nth (or last) given weekday of a month, or null if the month has no such day (a "5th" never exists here). */
export function nthWeekdayOfMonth(y: number, m: number, nth: Nth, day: Weekday): DateString | null {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  const lastDom = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const firstHit = 1 + ((day - first + 7) % 7)
  let dom: number
  if (nth === 'last') {
    dom = firstHit + Math.floor((lastDom - firstHit) / 7) * 7
  } else {
    dom = firstHit + (nth - 1) * 7
    if (dom > lastDom) return null
  }
  return fromMs(Date.UTC(y, m - 1, dom))
}

/** Problems that make a schedule unusable, in plain words. Empty means it can be expanded. */
export function scheduleProblems(s: Schedule): string[] {
  const out: string[] = []
  const times = (...ts: (string | null | undefined)[]) => {
    for (const t of ts) if (t != null && !isTime(t)) out.push(`"${String(t)}" is not a time (use HH:MM).`)
  }
  const span = (a: string, b: string) => {
    if (!isDate(a) || !isDate(b)) return out.push('A start and end date are required.')
    if (daysBetween(a, b) < 0) return out.push('The end date is before the start date.')
    if (daysBetween(a, b) > MAX_SPAN_DAYS) out.push(`A recurring event may run at most ${MAX_SPAN_DAYS} days.`)
  }
  switch (s.kind) {
    case 'listed':
      break
    case 'once':
      if (!isDate(s.date)) out.push('A date is required.')
      times(s.start, s.end)
      if (!isTime(s.start)) out.push('A start time is required.')
      break
    case 'daily':
      span(s.startDate, s.endDate)
      times(s.start, s.end)
      break
    case 'weekly':
      span(s.startDate, s.endDate)
      if (!Number.isInteger(s.everyWeeks) || s.everyWeeks < 1 || s.everyWeeks > 52) out.push('Every how many weeks must be from 1 to 52.')
      if (!s.slots.length) out.push('Choose at least one day of the week.')
      if (s.slots.length > 7) out.push('At most seven days of the week.')
      for (const slot of s.slots) {
        if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) out.push('A day of the week is not valid.')
        times(slot.start, slot.end)
      }
      break
    case 'monthly':
      span(s.startDate, s.endDate)
      times(s.start, s.end)
      if (!Number.isInteger(s.everyMonths) || s.everyMonths < 1 || s.everyMonths > 12) out.push('Every how many months must be from 1 to 12.')
      if (!([1, 2, 3, 4, 'last'] as unknown[]).includes(s.nth)) out.push('Choose first, second, third, fourth or last.')
      if (!Number.isInteger(s.day) || s.day < 0 || s.day > 6) out.push('A day of the week is not valid.')
      break
  }
  return out
}

const byStart = (a: Occurrence, b: Occurrence) => (a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date))

/**
 * Every occurrence of a schedule whose date falls in `[from, to]` (inclusive, `YYYY-MM-DD`), oldest first. An invalid schedule
 * has none. A window or schedule that would produce more than MAX_OCCURRENCES is cut at that many (the oldest kept).
 */
export function expand(s: Schedule, window: { from: DateString; to: DateString }): Occurrence[] {
  if (s.kind === 'listed' || scheduleProblems(s).length) return []
  const { from, to } = window
  const inWindow = (d: DateString) => d >= from && d <= to
  const out: Occurrence[] = []
  const push = (o: Occurrence) => {
    if (inWindow(o.date) && out.length < MAX_OCCURRENCES) out.push(o)
  }

  switch (s.kind) {
    case 'once':
      push({ date: s.date, start: s.start, end: s.end || null })
      break
    case 'daily': {
      const first = s.startDate < from ? from : s.startDate
      const last = s.endDate > to ? to : s.endDate
      for (let d = first; d <= last && out.length < MAX_OCCURRENCES; d = addDays(d, 1)) push({ date: d, start: s.start, end: s.end })
      break
    }
    case 'weekly': {
      const weekZero = addDays(s.startDate, -weekdayOf(s.startDate))
      const first = s.startDate < from ? from : s.startDate
      const last = s.endDate > to ? to : s.endDate
      for (let d = first; d <= last && out.length < MAX_OCCURRENCES; d = addDays(d, 1)) {
        const weeks = Math.floor(daysBetween(weekZero, d) / 7)
        if (weeks % s.everyWeeks !== 0) continue
        for (const slot of s.slots) if (slot.day === weekdayOf(d)) push({ date: d, start: slot.start, end: slot.end })
      }
      break
    }
    case 'monthly': {
      const a = parseDate(s.startDate)!
      const z = parseDate(s.endDate)!
      for (let i = 0, y = a.y, m = a.m; (y < z.y || (y === z.y && m <= z.m)) && out.length < MAX_OCCURRENCES; i++) {
        const idx = (y - a.y) * 12 + (m - a.m)
        if (idx % s.everyMonths === 0) {
          const d = nthWeekdayOfMonth(y, m, s.nth, s.day)
          if (d && d >= s.startDate && d <= s.endDate) push({ date: d, start: s.start, end: s.end })
        }
        m += 1
        if (m > 12) {
          m = 1
          y += 1
        }
        if (i > 12 * 3) break
      }
      break
    }
  }
  return out.sort(byStart)
}

/** The first and last dates a schedule can touch (for indexing and "ongoing" labels), or null for `listed`. */
export function scheduleBounds(s: Schedule): { first: DateString; last: DateString } | null {
  switch (s.kind) {
    case 'listed':
      return null
    case 'once':
      return isDate(s.date) ? { first: s.date, last: s.date } : null
    default:
      return isDate(s.startDate) && isDate(s.endDate) ? { first: s.startDate, last: s.endDate } : null
  }
}

/** The UTC instant of a local wall-clock time in a zone. (Standard time-zone inversion; correct away from the two DST edges, and at the edges to within the hour.) */
export function zonedInstant(date: DateString, time: TimeString, timeZone: string = EVENT_TIME_ZONE): Date {
  const [h, mi] = time.split(':').map(Number) as [number, number]
  const p = parseDate(date)!
  const guess = Date.UTC(p.y, p.m - 1, p.d, h, mi)
  const offsetAt = (t: number): number => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t))
    const g = (type: string) => Number(parts.find((x) => x.type === type)!.value)
    return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute')) - Math.floor(t / 60_000) * 60_000
  }
  const first = guess - offsetAt(guess)
  return new Date(guess - offsetAt(first))
}

/** When an occurrence ends: its end time, or if none, three hours after it starts. A clock time at or before the start is after midnight. */
export function occurrenceEnd(o: Occurrence): Date {
  if (!o.end) return new Date(zonedInstant(o.date, o.start).getTime() + 3 * 3_600_000)
  const sameDay = zonedInstant(o.date, o.end)
  return o.end > o.start ? sameDay : zonedInstant(addDays(o.date, 1), o.end)
}

/** Today's date in the station's zone. */
export function stationToday(now: Date, timeZone: string = EVENT_TIME_ZONE): DateString {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** An occurrence that has not finished at `now`. */
export const isUpcoming = (o: Occurrence, now: Date): boolean => occurrenceEnd(o).getTime() > now.getTime()

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const dayName = (d: Weekday): string => DAYS[d]!

/** `Nov 8, 2026`. */
export function shortDate(date: DateString): string {
  const p = parseDate(date)
  if (!p) return date
  return `${MONTHS[p.m - 1]} ${p.d}, ${p.y}`
}

/** `7:30 PM`. */
export function clock(time: TimeString): string {
  const [h, m] = time.split(':').map(Number) as [number, number]
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

export const timeRange = (start: TimeString, end?: TimeString | null): string => (end ? `${clock(start)} – ${clock(end)}` : clock(start))

const ORDINAL: Record<string, string> = { '1': 'first', '2': 'second', '3': 'third', '4': 'fourth', last: 'last' }

/** A schedule in a sentence, for the event page. (`listed` has no sentence: the page shows the text it was listed with.) */
export function describeSchedule(s: Schedule): string | null {
  switch (s.kind) {
    case 'listed':
      return null
    case 'once':
      return `${shortDate(s.date)}, ${timeRange(s.start, s.end)}`
    case 'daily':
      return `Every day, ${timeRange(s.start, s.end)}, ${shortDate(s.startDate)} through ${shortDate(s.endDate)}`
    case 'weekly': {
      const every = s.everyWeeks === 1 ? 'Every' : `Every ${s.everyWeeks} weeks on`
      const slots = s.slots.map((x) => `${dayName(x.day)} ${timeRange(x.start, x.end)}`).join('; ')
      return `${every} ${slots}, ${shortDate(s.startDate)} through ${shortDate(s.endDate)}`
    }
    case 'monthly': {
      const every = s.everyMonths === 1 ? 'Every month' : `Every ${s.everyMonths} months`
      return `${every} on the ${ORDINAL[String(s.nth)]} ${dayName(s.day)}, ${timeRange(s.start, s.end)}, ${shortDate(s.startDate)} through ${shortDate(s.endDate)}`
    }
  }
}
