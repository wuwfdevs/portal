import type { ListeningPublicEvent } from '@wuwf/portal-contracts'

import { looksLikeEmail, type Checked } from './inbox'

/** WUWF's wall clock. A session's date and time are the station's, never the server's or the reader's. */
export const EVENT_TIME_ZONE = 'America/Chicago'

/** AP style, as the boards write it: short months take a period, March to July are spelled out, September is "Sept.". */
const AP_MONTH: Record<string, string> = {
  January: 'Jan.',
  February: 'Feb.',
  August: 'Aug.',
  September: 'Sept.',
  October: 'Oct.',
  November: 'Nov.',
  December: 'Dec.',
}

/** "Saturday, Nov. 15, 10:00 a.m. to 12:00 p.m." (one day), or both dates when it crosses midnight. */
export function formatEventWhen(startsAt: string, endsAt: string): string {
  const start = new Date(startsAt)
  const end = new Date(endsAt)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return ''
  const day = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric' }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('weekday')}, ${AP_MONTH[get('month')] ?? get('month')} ${get('day')}`
  }
  const time = (d: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: EVENT_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d)
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
    return `${get('hour')}:${get('minute')} ${get('dayPeriod').toLowerCase().replace(/^(a|p)m$/, '$1.m.')}`
  }
  const sameDay = day(start) === day(end)
  return sameDay ? `${day(start)}, ${time(start)} to ${time(end)}` : `${day(start)}, ${time(start)} to ${day(end)}, ${time(end)}`
}

/** Where it is, as a person would say it. */
export function formatEventPlace(event: Pick<ListeningPublicEvent, 'placeName' | 'address' | 'city'>): string {
  return [event.placeName, event.address, event.city].filter((part): part is string => typeof part === 'string' && part.trim().length > 0).join(', ')
}

/** The seat line: how many are left, with no pressure and no count when the event has no limit. */
export function seatsSentence(seatsLeft: number | null): string | null {
  if (seatsLeft === null) return null
  if (seatsLeft <= 0) return 'Every seat is taken.'
  return seatsLeft === 1 ? '1 seat left.' : `${seatsLeft} seats left.`
}

export function eventIsFull(event: Pick<ListeningPublicEvent, 'seatsLeft'>): boolean {
  return event.seatsLeft !== null && event.seatsLeft <= 0
}

export interface SeatInput {
  name: string
  email: string
}

/** A seat is a name and an email used for this event only; saving the same email again changes nothing. */
export function checkSeat(input: SeatInput): Checked<SeatInput> {
  const name = input.name.trim()
  const email = input.email.trim()
  if (name.length === 0) return { ok: false, message: 'Add your name so we know who is coming.' }
  if (name.length > 200) return { ok: false, message: 'That name is too long.' }
  if (email.length === 0 || email.length > 320 || !looksLikeEmail(email)) return { ok: false, message: 'That email address does not look right.' }
  return { ok: true, value: { name, email } }
}
