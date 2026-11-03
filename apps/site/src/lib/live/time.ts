// Times on a live page. Readers are in Northwest Florida (Central time), and a live blog is read minute by minute, so the
// time of day matters and the zone is always named. Pure.

const CENTRAL = 'America/Chicago'

/** "Oct. 21, 2026, 1:16 p.m. CDT" for an ISO timestamp, in Central time; "" for anything that is not a time. */
export function formatCentral(iso: string | null | undefined): string {
  if (!iso) return ''
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const d = new Date(t)
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: CENTRAL, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).formatToParts(d)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  const month = get('month')
  const dayPeriod = get('dayPeriod').toLowerCase().replace(/^(a|p)m$/, '$1.m.')
  return `${month === 'May' ? month : `${month}.`} ${get('day')}, ${get('year')}, ${get('hour')}:${get('minute')} ${dayPeriod} ${get('timeZoneName')}`
}

const MONTHS: Record<string, number> = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 }
/** Hours behind UTC for the zone abbreviations Grove prints. */
const ZONES: Record<string, number> = { CST: -6, CDT: -5, EST: -5, EDT: -4, MST: -7, MDT: -6, PST: -8, PDT: -7, UTC: 0, GMT: 0 }

/**
 * Grove prints some times as words: "October 21, 2026 at 1:16 PM CDT". Read one back into an ISO timestamp, or null when it is
 * not in that shape or names a zone we do not know (the importer then keeps the exact timestamp it has instead).
 */
export function parseGroveDate(text: string | null | undefined): string | null {
  const m = /^\s*([A-Za-z]+) (\d{1,2}), (\d{4}) at (\d{1,2}):(\d{2}) (AM|PM) ([A-Z]{2,4})\s*$/.exec(text ?? '')
  if (!m) return null
  const month = MONTHS[m[1]!.toLowerCase()]
  const offset = ZONES[m[7]!]
  if (!month || offset === undefined) return null
  const [year, day] = [Number(m[3]), Number(m[2])]
  // Reject a day that does not exist (February 30th would otherwise roll over into March).
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return null
  let hour = Number(m[4]) % 12
  if (m[6] === 'PM') hour += 12
  return new Date(Date.UTC(year, month - 1, day, hour - offset, Number(m[5]))).toISOString()
}
