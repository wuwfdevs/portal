// Validation of a public community-calendar submission. Pure: it takes the raw form values and returns either a clean value or
// a message per field. Nothing here touches the database or the request.
//
// The fields are WUWF's existing submission form (https://www.wuwf.org/community-calendar-event-submission, read 2026-11-03):
// title, venue, one-time or recurring (daily, weekly with an interval and days, monthly by weekday), up to three categories,
// description, image, price, ticket link, presenting organization with its designation, artist, and who is submitting.
// Everything is plain text: markup is never accepted, so nothing a stranger types is ever rendered as HTML.

import { daysBetween, expand, isDate, isTime, scheduleProblems, type DateString, type Nth, type Schedule, type Weekday } from './schedule'

export const LIMITS = {
  title: 150,
  venueName: 150,
  line: 150,
  description: 4000,
  pricing: 500,
  name: 120,
  url: 300,
  email: 254,
  phone: 40,
  /** Furthest ahead an event may be submitted for. */
  daysAhead: 548,
  categoriesMax: 3,
} as const

export const SUBMITTING_AS = ['listener', 'venue', 'artist', 'promoter'] as const
export type SubmittingAs = (typeof SUBMITTING_AS)[number]
export const DESIGNATIONS = ['n-a', 'not-for-profit', 'for-profit'] as const
export type Designation = (typeof DESIGNATIONS)[number]

const US_STATES = new Set(
  'AL AK AS AZ AR CA CO CT DE DC FM FL GA GU HI ID IL IN IA KS KY LA ME MH MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND MP OH OK OR PW PA PR RI SC SD TN TX UT VT VI VA WA WV WI WY'.split(' '),
)

/** What a form posts: strings, or a list of strings for a multiple select. */
export type RawForm = Record<string, string | string[] | undefined | null>

export interface SubmissionValue {
  title: string
  venue: { name: string; street: string | null; city: string | null; state: string | null; zip: string | null; email: string | null; phone: string | null; website: string | null }
  schedule: Schedule
  categories: string[]
  description: string | null
  price: { text: string | null; free: boolean; additional: string | null }
  ticketUrl: string | null
  organization: { name: string | null; email: string | null; phone: string | null; website: string | null; designation: Designation }
  artist: { name: string | null; email: string | null; website: string | null }
  submitter: { name: string | null; email: string; role: SubmittingAs }
}

export type SubmissionResult = { ok: true; value: SubmissionValue } | { ok: false; errors: Record<string, string> }

export interface SubmissionContext {
  /** Category slugs that exist and may be chosen. */
  categories: readonly string[]
  /** Today in the station's time zone. */
  today: DateString
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g

const first = (v: string | string[] | undefined | null): string => (Array.isArray(v) ? (v[0] ?? '') : (v ?? ''))

/** Plain text: control characters removed, line ends normalized, trimmed. Never HTML. */
export function plain(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CONTROL, '').trim() : ''
}

const oneLine = (v: unknown): string => plain(v).replace(/\s+/g, ' ')

/** Text with markup in it is refused rather than cleaned: a person who typed a tag meant something else. */
const hasMarkup = (s: string): boolean => /<\s*\/?\s*[a-z!][^>]*>/i.test(s)

const EMAIL = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/

export const isEmail = (v: string): boolean => v.length <= LIMITS.email && EMAIL.test(v)

/** A web address, as an https/http URL. A bare "example.org" gets https://. Anything else (javascript:, data:, a path) is refused. */
export function webAddress(v: unknown): string | null {
  const s = oneLine(v)
  if (!s || s.length > LIMITS.url) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  let u: URL
  try {
    u = new URL(withScheme)
  } catch {
    return null
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (u.username || u.password) return null
  if (!u.hostname.includes('.') || /\s/.test(u.hostname)) return null
  return u.toString()
}

export function validate(raw: RawForm, ctx: SubmissionContext): SubmissionResult {
  const errors: Record<string, string> = {}
  const fail = (field: string, message: string) => {
    errors[field] ??= message
  }
  const get = (name: string) => first(raw[name])

  const text = (field: string, label: string, max: number, required = false): string | null => {
    const v = oneLine(get(field))
    if (!v) {
      if (required) fail(field, `${label} is required.`)
      return null
    }
    if (v.length > max) fail(field, `${label} is at most ${max} characters.`)
    if (hasMarkup(v)) fail(field, `${label} cannot contain HTML. Use plain text.`)
    return v
  }
  const email = (field: string, label: string, required = false): string | null => {
    const v = oneLine(get(field))
    if (!v) {
      if (required) fail(field, `${label} is required.`)
      return null
    }
    if (v.length > LIMITS.email || !EMAIL.test(v)) fail(field, `${label} does not look like an email address.`)
    return v
  }
  const url = (field: string, label: string): string | null => {
    if (!oneLine(get(field))) return null
    const v = webAddress(get(field))
    if (!v) fail(field, `${label} must be a web address such as https://example.org.`)
    return v
  }
  const phone = (field: string, label: string): string | null => {
    const v = oneLine(get(field))
    if (!v) return null
    if (v.length > LIMITS.phone || !/^[0-9+().\-\s x#ext]{7,}$/i.test(v)) fail(field, `${label} does not look like a phone number.`)
    return v
  }

  // --- Event
  const title = text('event-title', 'Event title', LIMITS.title, true) ?? ''

  // --- Venue
  const venueName = text('venue-name', 'Venue name', LIMITS.venueName, true) ?? ''
  const state = oneLine(get('venue-state')).toUpperCase()
  if (state && !US_STATES.has(state)) fail('venue-state', 'Choose a state from the list.')
  const zip = oneLine(get('venue-zip'))
  if (zip && !/^\d{5}(-\d{4})?$/.test(zip)) fail('venue-zip', 'A zip code is 5 digits (or 5+4).')

  // --- When
  const schedule = readSchedule(get, fail, ctx)

  // --- Categories
  const wanted = (Array.isArray(raw['event-category']) ? raw['event-category'] : raw['event-category'] ? [raw['event-category']] : []).map((c) => oneLine(c)).filter(Boolean)
  const categories = [...new Set(wanted)]
  if (!categories.length) fail('event-category', 'Choose at least one category.')
  else if (categories.length > LIMITS.categoriesMax) fail('event-category', `Choose up to ${LIMITS.categoriesMax} categories.`)
  else if (categories.some((c) => !ctx.categories.includes(c))) fail('event-category', 'One of the categories is not on the list.')

  // --- Description
  const description = plain(get('event-description'))
  if (description.length > LIMITS.description) fail('event-description', `The description is at most ${LIMITS.description} characters.`)
  if (hasMarkup(description)) fail('event-description', 'The description cannot contain HTML. Use plain text; blank lines make paragraphs.')

  // --- Price
  const free = get('this-is-a-free-event') !== ''
  const priceText = text('price-price-range', 'Price', 60)
  const additional = plain(get('additional-pricing-information'))
  if (additional.length > LIMITS.pricing) fail('additional-pricing-information', `Additional pricing information is at most ${LIMITS.pricing} characters.`)
  if (hasMarkup(additional)) fail('additional-pricing-information', 'Additional pricing information cannot contain HTML.')
  if (free && priceText) fail('price-price-range', 'A free event has no price. Clear the price or the free box.')

  // --- Organization, artist
  const designation = (oneLine(get('presenting-organization-designation')) || 'n-a') as Designation
  if (!DESIGNATIONS.includes(designation)) fail('presenting-organization-designation', 'Choose one of the designations.')

  // --- Who is submitting
  const role = oneLine(get('your-information-submitting-as')) as SubmittingAs
  if (!SUBMITTING_AS.includes(role)) fail('your-information-submitting-as', 'Tell us how you are submitting this.')

  const value: SubmissionValue = {
    title,
    venue: {
      name: venueName,
      street: text('venue-street-address', 'Street address', LIMITS.line),
      city: text('venue-city', 'City', LIMITS.line),
      state: state || null,
      zip: zip || null,
      email: email('venue-email', 'Venue email'),
      phone: phone('venue-phone', 'Venue phone'),
      website: url('venue-website', 'Venue website'),
    },
    schedule: schedule ?? { kind: 'listed' },
    categories,
    description: description || null,
    price: { text: priceText, free, additional: additional || null },
    ticketUrl: url('ticketing-website', 'Ticketing website'),
    organization: {
      name: text('presenting-organization-name', 'Organization name', LIMITS.name),
      email: email('presenting-organization-email', 'Organization email'),
      phone: phone('presenting-organization-phone', 'Organization phone'),
      website: url('presenting-organization-website', 'Organization website'),
      designation: DESIGNATIONS.includes(designation) ? designation : 'n-a',
    },
    artist: {
      name: text('artist-name', 'Artist name', LIMITS.name),
      email: email('artist-email', 'Artist email'),
      website: url('artist-website', 'Artist website'),
    },
    submitter: {
      name: text('your-information-name', 'Your name', LIMITS.name),
      email: email('your-information-email', 'Your email', true) ?? '',
      role: SUBMITTING_AS.includes(role) ? role : 'listener',
    },
  }

  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, value }
}

const WEEKDAY_FIELDS: Weekday[] = [0, 1, 2, 3, 4, 5, 6]
const NTH: Record<string, Nth> = { first: 1, second: 2, third: 3, fourth: 4, last: 'last' }

function readSchedule(get: (n: string) => string, fail: (field: string, message: string) => void, ctx: SubmissionContext): Schedule | null {
  const kind = oneLine(get('event-type'))
  const time = (field: string, label: string, required: boolean): string => {
    const v = oneLine(get(field))
    if (!v) {
      if (required) fail(field, `${label} is required.`)
      return ''
    }
    if (!isTime(v)) fail(field, `${label} is not a valid time.`)
    return v
  }
  const date = (field: string, label: string): string => {
    const v = oneLine(get(field))
    if (!v) fail(field, `${label} is required.`)
    else if (!isDate(v)) fail(field, `${label} is not a valid date.`)
    return v
  }
  const range = (startField: string, endField: string): { startDate: string; endDate: string } => {
    const startDate = date(startField, 'Start date')
    const endDate = date(endField, 'End date')
    return { startDate, endDate }
  }

  let schedule: Schedule | null = null
  if (kind === 'one-time-event') {
    const d = date('once-date', 'Event date')
    schedule = { kind: 'once', date: d, start: time('once-start', 'Start time', true), end: time('once-end', 'End time', false) || null }
  } else if (kind === 'recurring-event') {
    const repeats = oneLine(get('recurring-event-repeats'))
    if (repeats === 'recurring-event-repeats-daily') {
      schedule = { kind: 'daily', ...range('daily-start-date', 'daily-end-date'), start: time('daily-start', 'Start time', true), end: time('daily-end', 'End time', true) }
    } else if (repeats === 'recurring-event-repeats-weekly') {
      const slots = WEEKDAY_FIELDS.flatMap((day) =>
        get(`weekly-day-${day}`)
          ? [{ day, start: time(`weekly-start-${day}`, 'Start time', true), end: time(`weekly-end-${day}`, 'End time', true) }]
          : [],
      )
      if (!slots.length) fail('weekly-day-0', 'Choose at least one day of the week.')
      const every = Number(oneLine(get('weekly-interval')))
      if (!Number.isInteger(every) || every < 1 || every > 52) fail('weekly-interval', 'Choose how many weeks apart, from 1 to 52.')
      schedule = { kind: 'weekly', ...range('weekly-start-date', 'weekly-end-date'), everyWeeks: every, slots }
    } else if (repeats === 'recurring-event-repeats-monthly') {
      const nth = NTH[oneLine(get('monthly-frequency'))]
      if (!nth) fail('monthly-frequency', 'Choose first, second, third, fourth or last.')
      const day = WEEKDAY_FIELDS.find((d) => String(d) === oneLine(get('monthly-day-of-week')))
      if (day === undefined) fail('monthly-day-of-week', 'Choose a day of the week.')
      const every = Number(oneLine(get('monthly-every')))
      if (!Number.isInteger(every) || every < 1 || every > 12) fail('monthly-every', 'Choose every how many months, from 1 to 12.')
      schedule = { kind: 'monthly', ...range('monthly-start-date', 'monthly-end-date'), everyMonths: every, nth: nth ?? 1, day: day ?? 0, start: time('monthly-start', 'Start time', true), end: time('monthly-end', 'End time', true) }
    } else {
      fail('recurring-event-repeats', 'Choose how the event repeats.')
    }
  } else {
    fail('event-type', 'Choose whether this is a one-time or a recurring event.')
  }
  if (!schedule) return null

  const problems = scheduleProblems(schedule)
  // Field-level problems above already cover missing and invalid values; surface only what they did not.
  for (const p of problems) if (!/is required|not a valid|not a time|Choose|Every how many/.test(p)) fail(schedule.kind === 'once' ? 'once-date' : `${schedule.kind}-end-date`, p)
  if (problems.length) return schedule

  // Nothing in the past, nothing absurdly far ahead, and a recurring run must actually occur.
  const first = schedule.kind === 'once' ? schedule.date : schedule.startDate
  const last = schedule.kind === 'once' ? schedule.date : schedule.endDate
  const prefix = schedule.kind === 'once' ? 'once-date' : null
  if (last < ctx.today) fail(prefix ?? `${schedule.kind}-end-date`, 'That date has already passed.')
  else if (daysBetween(ctx.today, first) > LIMITS.daysAhead) fail(prefix ?? `${schedule.kind}-start-date`, 'We list events up to about eighteen months ahead.')
  else if (schedule.kind !== 'once' && expand(schedule, { from: ctx.today, to: last }).length === 0) {
    fail(`${schedule.kind}-start-date`, 'That schedule has no dates in it. Check the days and the start and end dates.')
  }
  return schedule
}
