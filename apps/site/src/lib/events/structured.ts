// schema.org/Event data for an event page, so search engines can show it in their event results. Pure.
// Times carry the station's UTC offset (it changes with daylight saving), so a search engine places them correctly.

import { EVENT_TIME_ZONE, parseDate, zonedInstant, type DateString, type Occurrence, type TimeString } from './schedule'

/** `2026-11-03T19:30:00-06:00`: a local date and time with its offset in the zone. */
export function zonedIso(date: DateString, time: TimeString, timeZone: string = EVENT_TIME_ZONE): string {
  const instant = zonedInstant(date, time, timeZone)
  const p = parseDate(date)!
  const [h, m] = time.split(':').map(Number) as [number, number]
  const offset = Math.round((Date.UTC(p.y, p.m - 1, p.d, h, m) - instant.getTime()) / 60_000)
  const sign = offset < 0 ? '-' : '+'
  const abs = Math.abs(offset)
  return `${date}T${time}:00${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

export interface JsonLdInput {
  url: string
  title: string
  description: string | null
  /** The occurrence to describe: the event's date, or a recurring event's next one. */
  occurrence: Occurrence | null
  venue: { name: string | null; street: string | null; city: string | null; state: string | null; zip: string | null }
  organizer: { name: string | null; website: string | null }
  free: boolean
  ticketUrl: string | null
  image: string | null
}

const ONLINE = /\b(virtual|online|zoom|webinar|livestream)\b/i

export function eventJsonLd(i: JsonLdInput): Record<string, unknown> | null {
  if (!i.occurrence) return null
  const o = i.occurrence
  const online = !i.venue.street && !i.venue.city && ONLINE.test(i.venue.name ?? '')
  const end = o.end ? zonedIso(o.end > o.start ? o.date : addOneDay(o.date), o.end) : undefined
  const place = i.venue.name
    ? {
        '@type': 'Place',
        name: i.venue.name,
        ...(i.venue.street || i.venue.city
          ? {
              address: {
                '@type': 'PostalAddress',
                ...(i.venue.street ? { streetAddress: i.venue.street } : {}),
                ...(i.venue.city ? { addressLocality: i.venue.city } : {}),
                ...(i.venue.state ? { addressRegion: i.venue.state } : {}),
                ...(i.venue.zip ? { postalCode: i.venue.zip } : {}),
              },
            }
          : {}),
      }
    : undefined
  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: i.title,
    url: i.url,
    startDate: zonedIso(o.date, o.start),
    ...(end ? { endDate: end } : {}),
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: online ? 'https://schema.org/OnlineEventAttendanceMode' : 'https://schema.org/OfflineEventAttendanceMode',
    ...(place ? { location: place } : {}),
    ...(i.description ? { description: i.description } : {}),
    ...(i.image ? { image: i.image } : {}),
    ...(i.organizer.name ? { organizer: { '@type': 'Organization', name: i.organizer.name, ...(i.organizer.website ? { url: i.organizer.website } : {}) } } : {}),
    ...(i.free ? { isAccessibleForFree: true, offers: { '@type': 'Offer', price: 0, priceCurrency: 'USD', ...(i.ticketUrl ? { url: i.ticketUrl } : {}) } } : i.ticketUrl ? { offers: { '@type': 'Offer', url: i.ticketUrl } } : {}),
  }
}

function addOneDay(date: DateString): DateString {
  const p = parseDate(date)!
  return new Date(Date.UTC(p.y, p.m - 1, p.d + 1)).toISOString().slice(0, 10)
}
