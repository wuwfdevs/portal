// Reads the date text on a Grove community-calendar page into a schedule. Pure.
//
// Grove keeps only a display string (`time`), written from the submission form. The shapes seen in the real pages and on the
// live calendar (2026-11-03):
//
//   one time   "07:00 PM - 09:00 PM on Tue, 31 Dec 2024"          (the end time is optional)
//   daily      "07:30 PM - 09:30 PM, every day through Nov 08, 2026."
//   weekly     "Every 40 weeks through Jun 28, 2025.\nSaturday: 09:00 AM - 02:00 PM"   (one line per day)
//
// A monthly shape has not been seen yet. Anything that does not match exactly becomes `listed`: kept with its text, flagged,
// no date guessed. A recurring run's START date is not in the text; the date the event was submitted (the last part of its
// address) stands in for it, and that is said, so the page shows the original wording rather than a computed sentence.

import { daysBetween, isDate, weekdayOf, type DateString, type Schedule, type TimeString, type Weekday } from './schedule'

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }
const WEEKDAYS: Record<string, Weekday> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

const T = '(\\d{1,2}):(\\d{2}) ?([AP]M)'
const MONTH_RE = '([A-Za-z]{3,9})'

export interface GroveTime {
  schedule: Schedule
  /** The text as Grove showed it, tidied (tags to line breaks, entities decoded, spaces collapsed). Shown on the page for a migrated event. */
  displayText: string
  /** The start date was not in the text and was taken from when the event was submitted. */
  startEstimated: boolean
  /** True when the text matched a known shape. False means `listed`: needs a person. */
  understood: boolean
  /** What a person should look at. Empty means nothing. */
  notes: string[]
}

const ENTITIES: Record<string, string> = { '&amp;': '&', '&nbsp;': ' ', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&rsquo;': '’', '&ndash;': '–' }

/** Grove's text with markup removed: line breaks kept, everything else plain. */
export function tidy(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:amp|nbsp|lt|gt|quot|#39|rsquo|ndash);/g, (m) => ENTITIES[m] ?? m)
    .replace(/[ \t ]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

function to24(h: string, m: string, ap: string): TimeString | null {
  const hh = Number(h)
  if (hh < 1 || hh > 12 || Number(m) > 59) return null
  const base = hh % 12
  return `${String((ap.toUpperCase() === 'PM' ? base + 12 : base)).padStart(2, '0')}:${m}`
}

function monthDay(mon: string, day: string, year: string): DateString | null {
  const mm = MONTHS[mon.slice(0, 3).toLowerCase()]
  if (!mm) return null
  const iso = `${year}-${String(mm).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`
  return isDate(iso) ? iso : null
}

/** The date an event was submitted, from the end of its Grove address (`...-19-09-2024-12-35-06` is day-month-year-time). */
export function submittedOn(path: string): DateString | null {
  const hit = /-(\d{2})-(\d{2})-(\d{4})-\d{2}-\d{2}-\d{2}$/.exec(path)
  if (!hit) return null
  const iso = `${hit[3]}-${hit[2]}-${hit[1]}`
  return isDate(iso) ? iso : null
}

const listed = (displayText: string, notes: string[]): GroveTime => ({ schedule: { kind: 'listed' }, displayText, startEstimated: false, understood: false, notes })

/**
 * `submitted` is the date from the page's address (see `submittedOn`), used only as the start of a recurring run whose text
 * has no start. `recurring` is Grove's own flag; the text is trusted over it, and a disagreement is noted.
 */
export function parseGroveTime(raw: unknown, ctx: { submitted: DateString | null; recurring?: boolean }): GroveTime {
  if (typeof raw !== 'string' || raw.trim() === '') return listed('', ['The page has no date text.'])
  const text = tidy(raw)
  const notes: string[] = []
  const note = (s: string) => notes.push(s)

  // One time.
  const once = new RegExp(`^${T}(?: - ${T})? on ([A-Za-z]{3}), (\\d{1,2}) ${MONTH_RE} (\\d{4})\\.?$`).exec(text)
  if (once) {
    const start = to24(once[1]!, once[2]!, once[3]!)
    const end = once[4] ? to24(once[4], once[5]!, once[6]!) : null
    const date = monthDay(once[9]!, once[8]!, once[10]!)
    if (!start || !date || (once[4] && !end)) return listed(text, ['The date text looks like one time but a date or time is not valid.'])
    const wd = WEEKDAYS[once[7]!.slice(0, 3).toLowerCase()]
    if (wd === undefined || wd !== weekdayOf(date)) note(`The day name "${once[7]}" does not match ${date}.`)
    if (ctx.recurring) note('Grove marks this as recurring, but its date text is a single date.')
    return { schedule: { kind: 'once', date, start, end }, displayText: text, startEstimated: false, understood: true, notes }
  }

  // Daily.
  const daily = new RegExp(`^${T} - ${T}, every day through ${MONTH_RE} (\\d{1,2}), (\\d{4})\\.?$`).exec(text)
  if (daily) {
    const start = to24(daily[1]!, daily[2]!, daily[3]!)
    const end = to24(daily[4]!, daily[5]!, daily[6]!)
    const endDate = monthDay(daily[7]!, daily[8]!, daily[9]!)
    if (!start || !end || !endDate) return listed(text, ['The date text looks daily but a date or time is not valid.'])
    return withEstimatedStart({ endDate, ctx, text, notes, build: (startDate) => ({ kind: 'daily', startDate, endDate, start, end }) })
  }

  // Weekly: "Every N weeks through Mon DD, YYYY." then one "Day: T - T" line per day.
  const lines = text.split('\n')
  const head = new RegExp(`^Every (?:(\\d+) )?weeks? through ${MONTH_RE} (\\d{1,2}), (\\d{4})\\.?$`).exec(lines[0] ?? '')
  if (head && lines.length > 1) {
    const everyWeeks = head[1] ? Number(head[1]) : 1
    const endDate = monthDay(head[2]!, head[3]!, head[4]!)
    const slots: { day: Weekday; start: TimeString; end: TimeString }[] = []
    for (const line of lines.slice(1)) {
      const hit = new RegExp(`^([A-Za-z]+): ${T} - ${T}$`).exec(line)
      const day = hit ? WEEKDAYS[hit[1]!.slice(0, 3).toLowerCase()] : undefined
      const start = hit ? to24(hit[2]!, hit[3]!, hit[4]!) : null
      const end = hit ? to24(hit[5]!, hit[6]!, hit[7]!) : null
      if (day === undefined || !start || !end) return listed(text, [`A weekly time line is not in the usual shape: "${line}".`])
      slots.push({ day, start, end })
    }
    if (!endDate) return listed(text, ['The date text looks weekly but its end date is not valid.'])
    return withEstimatedStart({ endDate, ctx, text, notes, build: (startDate) => ({ kind: 'weekly', startDate, endDate, everyWeeks, slots }) })
  }

  return listed(text, [`The date text is not in a shape the converter knows: "${text.slice(0, 120)}".`])
}

function withEstimatedStart(a: { endDate: DateString; ctx: { submitted: DateString | null; recurring?: boolean }; text: string; notes: string[]; build: (startDate: DateString) => Schedule }): GroveTime {
  const { endDate, ctx, text, notes } = a
  if (!ctx.submitted) return listed(text, ['A recurring run has no start date in its text and the address has no submission date to use.'])
  let startDate = ctx.submitted
  if (daysBetween(startDate, endDate) < 0) {
    notes.push(`It was submitted ${ctx.submitted}, after its end date ${endDate}; the run is taken as the end date only.`)
    startDate = endDate
  } else {
    notes.push('The start date is not in the text; the date it was submitted is used.')
  }
  if (!ctx.recurring) notes.push('Grove does not mark this as recurring, but its date text is a recurring run.')
  const schedule = a.build(startDate)
  return { schedule, displayText: text, startEstimated: true, understood: true, notes }
}

