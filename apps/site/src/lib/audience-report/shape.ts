// PostHog's rows, made into what the Audience screen draws. Pure: names come in as maps (`names.ts` reads them from the CMS), so this file
// never touches Payload or the network. A panel whose query failed is null, and the screen says so for that panel alone.

import type { QueryName, ReportRange } from './queries'

export type Rows = unknown[][]

export interface Named {
  title: string
  /** The page on the site, a path. */
  href: string | null
  /** The record in the admin. */
  adminHref: string | null
}

/** What the CMS says the ids are called. Any id missing from a map is shown as its id. */
export interface Names {
  channels: Record<string, string>
  audio: Record<string, Named>
  posts: Record<string, Named>
  shows: Record<string, Named>
}

export const NO_NAMES: Names = { channels: {}, audio: {}, posts: {}, shows: {} }

export interface Overview {
  pageviews: number
  visitors: number
  visits: number
  listenHours: number
  listens: number
}

export interface DayRow {
  date: string
  pageviews: number
  visitors: number
}

export interface ListenRow {
  source: 'live' | 'on_demand'
  streamId: string
  name: string
  href: string | null
  hours: number
  listens: number
}

export interface ContentRow {
  id: string
  kind: 'story' | 'episode' | 'show'
  name: string
  href: string | null
  adminHref: string | null
  views: number
  engaged: number
}

export interface AppealRow {
  kind: string
  surface: string
  shown: number
  clicked: number
}

export interface AudienceReport {
  range: ReportRange
  overview: Overview | null
  daily: DayRow[] | null
  listening: ListenRow[] | null
  content: ContentRow[] | null
  appeals: AppealRow[] | null
  conversions: { frequency: string; count: number }[] | null
  sources: { domain: string; visits: number }[] | null
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}
const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/** Hours from seconds, to one decimal. */
export const hoursOf = (seconds: number): number => Math.round((seconds / 3600) * 10) / 10

const APPEAL_KINDS: Record<string, string> = { membership: 'Membership appeal', support: 'Support section' }
const SURFACES: Record<string, string> = { story: 'Story pages', home: 'Home page', section: 'Pages of sections' }

/** The ids PostHog returned that need names, for `names.ts` to look up. */
export function idsToName(raw: Partial<Record<QueryName, Rows | null>>): { channels: string[]; audio: string[]; posts: string[]; shows: string[] } {
  const out = { channels: new Set<string>(), audio: new Set<string>(), posts: new Set<string>(), shows: new Set<string>() }
  for (const [source, id] of raw.listening ?? []) {
    if (source === 'live') out.channels.add(str(id))
    else if (source === 'on_demand') out.audio.add(str(id))
  }
  for (const [id, kind] of raw.content ?? []) (kind === 'show' ? out.shows : out.posts).add(str(id))
  return { channels: [...out.channels], audio: [...out.audio], posts: [...out.posts], shows: [...out.shows] }
}

/** The report, from each query's rows (null for one that failed) and the names. */
export function shapeReport(range: ReportRange, raw: Partial<Record<QueryName, Rows | null>>, names: Names = NO_NAMES): AudienceReport {
  const has = (q: QueryName) => Array.isArray(raw[q])
  const first = raw.overview?.[0] ?? []
  return {
    range,
    overview: has('overview')
      ? { pageviews: num(first[0]), visitors: num(first[1]), visits: num(first[2]), listenHours: hoursOf(num(first[3])), listens: num(first[4]) }
      : null,
    daily: has('daily') ? raw.daily!.map((r) => ({ date: str(r[0]).slice(0, 10), pageviews: num(r[1]), visitors: num(r[2]) })) : null,
    listening: has('listening')
      ? raw.listening!.map((r) => {
          const source = r[0] === 'live' ? 'live' : 'on_demand'
          const streamId = str(r[1])
          const named = source === 'live' ? { title: names.channels[streamId], href: '/listen' } : names.audio[streamId]
          return { source, streamId, name: named?.title || streamId, href: named?.href ?? null, hours: hoursOf(num(r[2])), listens: num(r[3]) }
        })
      : null,
    content: has('content')
      ? raw.content!.map((r) => {
          const id = str(r[0])
          const kind = r[1] === 'show' ? 'show' : r[1] === 'episode' ? 'episode' : 'story'
          const named = kind === 'show' ? names.shows[id] : names.posts[id]
          return { id, kind, name: named?.title || `#${id}`, href: named?.href ?? null, adminHref: named?.adminHref ?? null, views: num(r[2]), engaged: num(r[3]) }
        })
      : null,
    appeals: has('appeals')
      ? raw.appeals!.map((r) => ({ kind: APPEAL_KINDS[str(r[0])] ?? str(r[0]), surface: SURFACES[str(r[1])] ?? str(r[1]), shown: num(r[2]), clicked: num(r[3]) }))
      : null,
    conversions: has('conversions') ? raw.conversions!.map((r) => ({ frequency: str(r[0]) || 'not chosen', count: num(r[1]) })) : null,
    sources: has('sources') ? raw.sources!.map((r) => ({ domain: str(r[0]) === '$direct' ? 'Direct or unknown' : str(r[0]), visits: num(r[1]) })) : null,
  }
}

/** A share as a percent with one decimal, or a dash when there is nothing to divide by. */
export const percent = (part: number, whole: number): string => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '–')
