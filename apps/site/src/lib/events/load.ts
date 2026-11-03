import configPromise from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Event, EventCategory, Media } from '@/payload-types'

import { buildCalendar, parseCalendarQuery, windowOf, type CalendarEvent, type CalendarQuery, type CalendarResult } from './calendar'
import { expand, isUpcoming, stationToday, addDays, type Occurrence, type Schedule } from './schedule'
import { scheduleFromStored } from './stored'

const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

/** Every calendar category, A to Z. Public. */
export const loadCategories = cache(async (): Promise<EventCategory[]> => {
  const payload = await getPayload({ config: configPromise })
  return (await payload.find({ collection: 'event-categories', depth: 0, limit: 100, overrideAccess: false, pagination: false, sort: 'title' })).docs
})

/** The most events one calendar read will look at. The station lists about a hundred upcoming at a time. */
const READ_CAP = 1500

export interface CalendarData {
  query: CalendarQuery
  result: CalendarResult
  categories: EventCategory[]
  now: Date
}

const toCalendarEvent = (e: Pick<Event, 'id' | 'title' | 'teaser' | 'path' | 'categories' | 'schedule' | 'venue' | 'organization' | 'price' | 'free'>): CalendarEvent => ({
  id: e.id,
  path: e.path ?? '',
  title: e.title,
  teaser: e.teaser ?? null,
  categories: (e.categories ?? []).flatMap((c) => {
    const o = named<EventCategory>(c)
    return o ? [{ slug: o.slug, title: o.title }] : []
  }),
  schedule: scheduleFromStored(e.schedule as never),
  venueName: e.venue?.name ?? null,
  city: e.venue?.city ?? null,
  organizer: e.organization?.name ?? null,
  price: e.price ?? null,
  free: Boolean(e.free),
})

/**
 * The calendar for a request. Reads through access control (a draft is never listed). The database narrows to events that are
 * not over before the window starts and do not begin after it ends; the rest of the work is the pure `buildCalendar`.
 */
export async function loadCalendar(params: Record<string, string | string[] | undefined>, now: Date = new Date()): Promise<CalendarData> {
  const payload = await getPayload({ config: configPromise })
  const categories = await loadCategories()
  const query = parseCalendarQuery(params, categories.map((c) => ({ slug: c.slug, groveId: c.legacy?.groveId ?? null })))
  const window = windowOf(query, stationToday(now))
  const found = await payload.find({
    collection: 'events',
    depth: 1,
    draft: false,
    limit: READ_CAP,
    overrideAccess: false,
    pagination: false,
    select: { title: true, teaser: true, path: true, categories: true, schedule: true, venue: true, organization: true, price: true, free: true, firstDate: true, lastDate: true },
    where: { and: [{ lastDate: { greater_than_equal: window.from } }, { firstDate: { less_than_equal: window.to } }, { path: { exists: true } }] },
  })
  if (found.docs.length >= READ_CAP) payload.logger.warn(`Community calendar read hit its cap of ${READ_CAP} events; later ones are not listed.`)
  return { query, result: buildCalendar(found.docs.map(toCalendarEvent), query, now), categories, now }
}

export interface EventPageData {
  event: Event
  categories: EventCategory[]
  image: Media | null
  schedule: Schedule
  /** Dates still to come (at most 12), soonest first; empty for a one-time event that has passed or a schedule that was not read. */
  upcoming: Occurrence[]
  /** The event's first or last date has gone and nothing is left. */
  past: boolean
}

/** An event by its address, or null. Public reads see published events only. */
export const loadEventByPath = cache(async (path: string): Promise<EventPageData | null> => {
  const payload = await getPayload({ config: configPromise })
  const event = (await payload.find({ collection: 'events', depth: 2, draft: false, limit: 1, overrideAccess: false, pagination: false, where: { path: { equals: path } } })).docs[0]
  if (!event) return null
  const now = new Date()
  const schedule = scheduleFromStored(event.schedule as never)
  const today = stationToday(now)
  const upcoming = expand(schedule, { from: today, to: addDays(today, 730) })
    .filter((o) => isUpcoming(o, now))
    .slice(0, 12)
  return {
    event,
    categories: (event.categories ?? []).flatMap((c) => {
      const o = named<EventCategory>(c)
      return o ? [o] : []
    }),
    image: named<Media>(event.image),
    schedule,
    upcoming,
    past: schedule.kind !== 'listed' && upcoming.length === 0,
  }
})
