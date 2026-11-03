// How an event's schedule and text are stored in the database, and how a reviewed submission becomes an event. Pure.
//
// Payload keeps a schedule as flat fields (select values are strings), so these map to and from the typed `Schedule` the
// rest of the code uses. A stored schedule that is incomplete reads as `listed` (no occurrences), never as a guess.

import { paragraph, root, text as lexText, linebreak } from '../grove/lexical'
import type { LexicalState } from '../grove/types'
import { slugify } from '../slug'
import { isDate, isTime, scheduleBounds, scheduleProblems, type Nth, type Schedule, type Weekday } from './schedule'
import type { SubmissionValue } from './submission'

export interface StoredSchedule {
  kind?: 'once' | 'daily' | 'weekly' | 'monthly' | 'listed' | null
  date?: string | null
  startDate?: string | null
  endDate?: string | null
  start?: string | null
  end?: string | null
  everyWeeks?: number | null
  slots?: { day?: string | null; start?: string | null; end?: string | null }[] | null
  everyMonths?: number | null
  nth?: string | null
  weekday?: string | null
  /** Grove's original wording, kept for a migrated event whose dates were read from text. */
  displayText?: string | null
  startEstimated?: boolean | null
}

const day = (v: unknown): Weekday | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isInteger(n) && n >= 0 && n <= 6 ? (n as Weekday) : null
}
const nth = (v: unknown): Nth | null => {
  if (v === 'last') return 'last'
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return n === 1 || n === 2 || n === 3 || n === 4 ? n : null
}

/** A stored schedule as a typed one. Anything incomplete or invalid is `listed`. */
export function scheduleFromStored(s: StoredSchedule | null | undefined): Schedule {
  if (!s || !s.kind || s.kind === 'listed') return { kind: 'listed' }
  let out: Schedule | null = null
  switch (s.kind) {
    case 'once':
      if (isDate(s.date) && isTime(s.start)) out = { kind: 'once', date: s.date, start: s.start, end: isTime(s.end) ? s.end : null }
      break
    case 'daily':
      if (isDate(s.startDate) && isDate(s.endDate) && isTime(s.start) && isTime(s.end)) out = { kind: 'daily', startDate: s.startDate, endDate: s.endDate, start: s.start, end: s.end }
      break
    case 'weekly': {
      const slots = (s.slots ?? []).flatMap((x) => {
        const d = day(x.day)
        return d !== null && isTime(x.start) && isTime(x.end) ? [{ day: d, start: x.start, end: x.end }] : []
      })
      if (isDate(s.startDate) && isDate(s.endDate) && s.everyWeeks && slots.length === (s.slots ?? []).length) out = { kind: 'weekly', startDate: s.startDate, endDate: s.endDate, everyWeeks: s.everyWeeks, slots }
      break
    }
    case 'monthly': {
      const n = nth(s.nth)
      const d = day(s.weekday)
      if (isDate(s.startDate) && isDate(s.endDate) && isTime(s.start) && isTime(s.end) && s.everyMonths && n && d !== null)
        out = { kind: 'monthly', startDate: s.startDate, endDate: s.endDate, everyMonths: s.everyMonths, nth: n, day: d, start: s.start, end: s.end }
      break
    }
  }
  return out && scheduleProblems(out).length === 0 ? out : { kind: 'listed' }
}

/** A typed schedule as flat stored fields. (Fields that do not apply to its kind are left out; the caller sets the Grove ones.) */
export function scheduleToStored(s: Schedule): StoredSchedule {
  switch (s.kind) {
    case 'listed':
      return { kind: 'listed' }
    case 'once':
      return { kind: 'once', date: s.date, start: s.start, end: s.end ?? null }
    case 'daily':
      return { kind: 'daily', startDate: s.startDate, endDate: s.endDate, start: s.start, end: s.end }
    case 'weekly':
      return { kind: 'weekly', startDate: s.startDate, endDate: s.endDate, everyWeeks: s.everyWeeks, slots: s.slots.map((x) => ({ day: String(x.day), start: x.start, end: x.end })) }
    case 'monthly':
      return { kind: 'monthly', startDate: s.startDate, endDate: s.endDate, everyMonths: s.everyMonths, nth: String(s.nth), weekday: String(s.day), start: s.start, end: s.end }
  }
}

/** The first and last date, for the indexed columns the calendar queries by. Null for an unreadable schedule. */
export const boundsOfStored = (s: StoredSchedule | null | undefined): { first: string; last: string } | null => scheduleBounds(scheduleFromStored(s))

/** Plain text (paragraphs on blank lines, line breaks inside) as the editor's JSON. */
export function lexicalFromPlain(textValue: string | null | undefined): LexicalState {
  const paragraphs = (textValue ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return root(
    paragraphs.map((p) => {
      const lines = p.split('\n')
      return paragraph(lines.flatMap((line, i) => (i === 0 ? [lexText(line)] : [linebreak(), lexText(line)]))
    )}),
  )
}

/** A short card teaser from plain text: the first paragraph, cut at a word and given an ellipsis. */
export function teaserOf(textValue: string | null | undefined, max = 240): string | null {
  const first = (textValue ?? '').replace(/\r\n?/g, '\n').split(/\n{2,}/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  if (!first) return null
  if (first.length <= max) return first
  const cut = first.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), Math.floor(max / 2))).replace(/[\s,;:.–-]+$/, '')}…`
}

/** The address of a new event: `/community-calendar/event/<title>-<first date>`, made unique by the caller's check. */
export const EVENT_PATH_PREFIX = '/community-calendar/event/'
export const eventPathBase = (title: string, firstDate: string | null): string => `${EVENT_PATH_PREFIX}${slugify(`${title} ${firstDate ?? ''}`) || 'event'}`

export type EventData = {
  title: string
  teaser: string | null
  schedule: StoredSchedule
  venue: SubmissionValue['venue']
  organization: SubmissionValue['organization']
  artist: SubmissionValue['artist']
  /** Category ids, in the order chosen. */
  categories: (string | number)[]
  descriptionText: string | null
  description: LexicalState
  price: string | null
  free: boolean
  priceNotes: string | null
  ticketUrl: string | null
}

/** What a reviewed submission becomes. Contact details of the person who submitted it are not part of an event. */
export function eventFromSubmission(v: SubmissionValue, categoryIds: ReadonlyMap<string, string | number>): EventData {
  return {
    title: v.title,
    teaser: teaserOf(v.description),
    schedule: scheduleToStored(v.schedule),
    venue: v.venue,
    organization: v.organization,
    artist: v.artist,
    categories: v.categories.flatMap((slug) => (categoryIds.has(slug) ? [categoryIds.get(slug)!] : [])),
    descriptionText: v.description,
    description: lexicalFromPlain(v.description),
    price: v.price.free ? null : v.price.text,
    free: v.price.free,
    priceNotes: v.price.additional,
    ticketUrl: v.ticketUrl,
  }
}

/** Things a reviewer should look at before approving, from the station's own guidelines. Advisory: none of them blocks approval. */
export function reviewConcerns(v: SubmissionValue, ctx: { duplicate: boolean }): string[] {
  const out: string[] = []
  const org = v.organization
  if (org.designation === 'for-profit') out.push('Presenting organization is for-profit. The guidelines do not allow for-profit events that charge a fee or sell tickets, or that promote a business.')
  if (org.designation === 'n-a' && !org.name) out.push('No presenting organization is named, so whether it is non-profit cannot be told.')
  if (org.designation === 'for-profit' && (v.price.text || v.ticketUrl)) out.push('A for-profit organization lists a price or a ticket link.')
  if (!v.venue.street && !v.venue.city && !/virtual|online|zoom/i.test(v.venue.name)) out.push('The venue has no address and does not say it is online.')
  if (ctx.duplicate) out.push('An event with the same title on the same first date already exists.')
  const problems = scheduleProblems(v.schedule)
  if (problems.length) out.push(`The schedule has problems: ${problems.join(' ')}`)
  if (v.description && (v.description.match(/https?:\/\//gi)?.length ?? 0) > 3) out.push('The description has several links.')
  return out
}
