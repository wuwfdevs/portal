// RadioLive (board 12): which performances are coming and which are past, how a lineup reads, and who appeared when. Pure; no database.
// Dates are shown in the station's time (Central), whatever the server's clock says.

const ZONE = 'America/Chicago'

export interface PerformanceLike {
  slug: string
  /** An editor's own headline; the lineup is used when empty. */
  title?: string | null
  startsAt: string
  lineup: { slug: string; name: string }[]
}

/** "A", "A & B", "A, B & C". */
export function joinNames(names: readonly string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean)
  if (list.length <= 1) return list[0] ?? ''
  return `${list.slice(0, -1).join(', ')} & ${list.at(-1)}`
}

/** What a show is called: the editor's headline, else its lineup, else nothing. */
export const performanceTitle = (p: Pick<PerformanceLike, 'title' | 'lineup'>): string => p.title?.trim() || joinNames(p.lineup.map((a) => a.name))

/** The Central calendar day of an instant, as YYYY-MM-DD. */
export function centralDay(iso: string | Date): string {
  const d = new Date(iso)
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const time = (iso: string): number => {
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

/**
 * Upcoming and past. A show is still "upcoming" for the whole of its Central day (it is on tonight), so the page does not call a show
 * past while the doors are open. Upcoming is soonest first, past is newest first.
 */
export function splitPerformances<T extends PerformanceLike>(list: readonly T[], now: string | Date): { upcoming: T[]; past: T[] } {
  const today = centralDay(now)
  const upcoming: T[] = []
  const past: T[] = []
  for (const p of list) (centralDay(p.startsAt) >= today ? upcoming : past).push(p)
  upcoming.sort((a, b) => time(a.startsAt) - time(b.startsAt))
  past.sort((a, b) => time(b.startsAt) - time(a.startsAt))
  return { upcoming, past }
}

/** "Dec", "3" and "Thursday, Dec. 3" for a date badge and a line of text. */
export function dateParts(iso: string): { month: string; day: string; weekday: string; long: string; time: string } {
  const d = new Date(iso)
  const fmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone: ZONE, ...o }).format(d)
  return {
    month: fmt({ month: 'short' }),
    day: fmt({ day: 'numeric' }),
    weekday: fmt({ weekday: 'long' }),
    long: fmt({ month: 'short', day: 'numeric', year: 'numeric' }),
    time: fmt({ hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' AM', ' a.m.').replace(' PM', ' p.m.'),
  }
}

export type TicketStatus = 'soon' | 'onSale' | 'soldOut' | 'free'

/** What to say about tickets, and whether there is a button. A button needs an address; without one, a show "on sale" says nothing false. */
export function ticketInfo(status: TicketStatus | null | undefined, url: string | null | undefined): { label: string; href: string | null } {
  switch (status) {
    case 'onSale':
      return url ? { label: 'Get tickets', href: url } : { label: 'Tickets on sale', href: null }
    case 'soldOut':
      return { label: 'Sold out', href: null }
    case 'free':
      return { label: 'Free to attend', href: null }
    default:
      return { label: 'Tickets on sale soon', href: null }
  }
}

export interface ArtistAppearance {
  slug: string
  name: string
  count: number
  /** The newest appearance, an ISO instant. */
  last: string
}

/** Each artist who played a show in `performances`, with how many times and when last, the most recent first. Only the shows given count. */
export function appearances(performances: readonly PerformanceLike[]): ArtistAppearance[] {
  const by = new Map<string, ArtistAppearance>()
  for (const p of performances) {
    for (const a of p.lineup) {
      const cur = by.get(a.slug)
      if (!cur) by.set(a.slug, { slug: a.slug, name: a.name, count: 1, last: p.startsAt })
      else {
        cur.count += 1
        if (time(p.startsAt) > time(cur.last)) cur.last = p.startsAt
      }
    }
  }
  return [...by.values()].sort((a, b) => time(b.last) - time(a.last) || a.name.localeCompare(b.name))
}

/** "2 appearances · Oct. 29, 2026" (the count is left out for one). */
export function appearanceLine(a: ArtistAppearance): string {
  const when = dateParts(a.last).long
  return a.count > 1 ? `${a.count} appearances · ${when}` : when
}
