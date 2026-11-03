import { parseDate, weekdayOf, type DateString } from '@/lib/events/schedule'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** `Tuesday, November 3` (the year is added when it is not `today`'s year). */
export function dayHeading(date: DateString, today: DateString): string {
  const p = parseDate(date)
  if (!p) return date
  const year = parseDate(today)?.y === p.y ? '' : `, ${p.y}`
  return `${DAYS[weekdayOf(date)]}, ${MONTHS[p.m - 1]} ${p.d}${year}`
}

/** Venue lines for a card or page: "Name, City" or whichever parts exist. */
export const where = (name?: string | null, city?: string | null): string | null => [name, city].filter(Boolean).join(', ') || null
