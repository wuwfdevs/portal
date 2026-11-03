import { describe, expect, it } from 'vitest'

import { eventJsonLd, zonedIso } from './structured'

const base = {
  url: 'https://www.wuwf.org/community-calendar/event/x',
  title: 'Fall Plant Sale',
  description: 'Plants.',
  occurrence: { date: '2026-11-14', start: '09:00', end: '14:00' },
  venue: { name: 'Garden Center', street: '1850 N 9th Avenue', city: 'Pensacola', state: 'FL', zip: '32503' },
  organizer: { name: 'Garden Clubs', website: 'https://garden.example.org/' },
  free: false,
  ticketUrl: null,
  image: null,
}

describe('zonedIso', () => {
  it('carries the offset in force on that date', () => {
    expect(zonedIso('2026-11-03', '19:30')).toBe('2026-11-03T19:30:00-06:00') // standard time
    expect(zonedIso('2026-07-04', '12:00')).toBe('2026-07-04T12:00:00-05:00') // daylight time
    expect(zonedIso('2026-11-01', '12:00')).toBe('2026-11-01T12:00:00-06:00') // the morning daylight time ended
  })
})

describe('eventJsonLd', () => {
  it('describes an event with its place, organizer and times', () => {
    const j = eventJsonLd(base)!
    expect(j['@type']).toBe('Event')
    expect(j.startDate).toBe('2026-11-14T09:00:00-06:00')
    expect(j.endDate).toBe('2026-11-14T14:00:00-06:00')
    expect(j.eventAttendanceMode).toBe('https://schema.org/OfflineEventAttendanceMode')
    expect(j.location).toMatchObject({ name: 'Garden Center', address: { streetAddress: '1850 N 9th Avenue', addressLocality: 'Pensacola', addressRegion: 'FL', postalCode: '32503' } })
    expect(j.organizer).toMatchObject({ name: 'Garden Clubs', url: 'https://garden.example.org/' })
    expect(j.offers).toBeUndefined()
  })
  it('an end time at or before the start is after midnight, so the end is the next day', () => {
    const j = eventJsonLd({ ...base, occurrence: { date: '2026-11-14', start: '22:00', end: '01:00' } })!
    expect(j.endDate).toBe('2026-11-15T01:00:00-06:00')
  })
  it('no end time, no end date', () => {
    expect(eventJsonLd({ ...base, occurrence: { date: '2026-11-14', start: '09:00', end: null } })!.endDate).toBeUndefined()
  })
  it('free events say so; a ticket link is an offer', () => {
    expect(eventJsonLd({ ...base, free: true })).toMatchObject({ isAccessibleForFree: true, offers: { price: 0, priceCurrency: 'USD' } })
    expect(eventJsonLd({ ...base, ticketUrl: 'https://tickets.example.org/' })).toMatchObject({ offers: { url: 'https://tickets.example.org/' } })
  })
  it('an online venue is marked online', () => {
    const j = eventJsonLd({ ...base, venue: { name: 'Virtual via Zoom', street: null, city: null, state: null, zip: null } })!
    expect(j.eventAttendanceMode).toBe('https://schema.org/OnlineEventAttendanceMode')
    expect((j.location as { address?: unknown }).address).toBeUndefined()
  })
  it('an event with no readable date has no structured data', () => {
    expect(eventJsonLd({ ...base, occurrence: null })).toBeNull()
  })
})
