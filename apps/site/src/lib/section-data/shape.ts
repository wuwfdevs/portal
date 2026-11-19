// What the data blocks (Featured record, List, Dates, Credit) show, as plain JSON-safe values, and the rules that turn a stored record into
// one. Pure: no database, no React, no clock (the clock is passed in). The loaders in `load.ts` read the records and call these; the
// blocks draw what these return. Every function treats a relation as untrusted: a deleted picture or story leaves a bare id, and a
// record that cannot be drawn is left out, never half-drawn.

import { STATION_TIME_ZONE } from '@/lib/format'

export interface PictureData {
  id: number | string
  url: string
  alt: string | null
  width: number | null
  height: number | null
  mimeType: string | null
  updatedAt: string | null
  focalX: number | null
  focalY: number | null
}

export interface AudioData {
  id: number | string
  url: string | null
  title: string | null
  credit: string | null
  durationSeconds: number | null
}

/** One entry of a List: a story, an episode, a video story or an artist. */
export interface ListItem {
  id: string
  title: string
  href: string | null
  image: PictureData | null
  meta: string | null
}

/** What a Featured record leads with: a story, an episode or a show. */
export interface FeaturedItem {
  kind: 'story' | 'show'
  title: string
  description: string | null
  href: string | null
  image: PictureData | null
  audio: AudioData | null
}

/** One dated line: a typed date, a RadioLive show or a community event. `startsAt` and `endsAt` are ISO instants. */
export interface DateItem {
  id: string
  title: string
  startsAt: string
  endsAt: string | null
  place: string | null
  href: string | null
}

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const idOf = (v: unknown): number | string | null => (typeof v === 'number' || (typeof v === 'string' && v !== '') ? v : null)

/** The id of a relation whether it arrives populated (an object) or bare (a number or string); null for nothing usable. */
export function relationId(value: unknown): number | string | null {
  return idOf(value) ?? idOf(obj(value)?.id)
}

/** A picture to draw, or null: a bare id (deleted or unpopulated) and a record with no address both draw nothing. */
export function pictureOf(value: unknown): PictureData | null {
  const m = obj(value)
  const id = idOf(m?.id)
  const url = str(m?.url)
  if (!m || id === null || !url) return null
  return { id, url, alt: str(m.alt), width: num(m.width), height: num(m.height), mimeType: str(m.mimeType), updatedAt: str(m.updatedAt), focalX: num(m.focalX), focalY: num(m.focalY) }
}

/** An audio file to hand to the player. A members-only file reads back without its address, which `trackFromAudio` then refuses. */
export function audioOf(value: unknown): AudioData | null {
  const a = obj(value)
  const id = idOf(a?.id)
  if (!a || id === null) return null
  return { id, url: str(a.url), title: str(a.title), credit: str(a.credit), durationSeconds: num(a.durationSeconds) }
}

/** The path of a story, or null when it has none yet (never published) or is not an address on this site. */
const sitePath = (v: unknown): string | null => {
  const p = str(v)
  return p && p.startsWith('/') && !p.startsWith('//') ? p : null
}

const FORMAT_WORDS: Record<string, string> = { audio: 'Audio story', video: 'Video story', live: 'Live blog' }

const shortDate = (iso: unknown): string | null => {
  const s = str(iso)
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: STATION_TIME_ZONE }).format(d)
}

/** A story (or an episode, which is a story with audio) as a List entry. A story with no title is left out. */
export function storyListItem(doc: unknown): ListItem | null {
  const p = obj(doc)
  const title = str(p?.title)
  const id = idOf(p?.id)
  if (!p || !title || id === null) return null
  const meta = obj(p.meta)
  const format = str(p.format)
  const bits = [format ? FORMAT_WORDS[format] ?? null : null, shortDate(p.publishedAt)].filter((b): b is string => b !== null)
  return { id: `post-${id}`, title, href: sitePath(p.path), image: pictureOf(meta?.image), meta: bits.length > 0 ? bits.join(' · ') : null }
}

/** A story as a Featured record. The line is the story's description, else its dek. */
export function storyFeatured(doc: unknown): FeaturedItem | null {
  const p = obj(doc)
  const title = str(p?.title)
  if (!p || !title) return null
  const meta = obj(p.meta)
  return { kind: 'story', title, description: str(meta?.description) ?? str(p.dek), href: sitePath(p.path), image: pictureOf(meta?.image), audio: audioOf(p.featuredAudio) }
}

/** A show (an original production, or a syndicated program) as a Featured record. Its address is `/shows/<slug>`. */
export function productionFeatured(doc: unknown): FeaturedItem | null {
  const p = obj(doc)
  const title = str(p?.title)
  const slug = str(p?.slug)
  if (!p || !title) return null
  return { kind: 'show', title, description: str(p.tagline) ?? str(p.schedule), href: slug && /^[a-z0-9-]+$/.test(slug) ? `/shows/${slug}` : null, image: null, audio: null }
}

/** An artist as a List entry, linking to its RadioLive page. */
export function artistListItem(doc: unknown): ListItem | null {
  const a = obj(doc)
  const name = str(a?.name)
  const slug = str(a?.slug)
  const id = idOf(a?.id)
  if (!a || !name || id === null) return null
  return { id: `artist-${id}`, title: name, href: slug && /^[a-z0-9-]+$/.test(slug) ? `/radiolive/artists/${slug}` : null, image: pictureOf(a.photo), meta: null }
}

/** A RadioLive show (a performance) as a dated line. Its address is `/radiolive/<slug>`. A show with no title or no valid start is left out. */
export function performanceDateItem(doc: unknown): DateItem | null {
  const p = obj(doc)
  const title = str(p?.title)
  const startsAt = isoOf(p?.startsAt)
  const slug = str(p?.slug)
  const id = idOf(p?.id)
  if (!p || !title || !startsAt || id === null) return null
  return { id: `show-${id}`, title, startsAt, endsAt: null, place: str(p.venue), href: slug && /^[a-z0-9-]+$/.test(slug) ? `/radiolive/${slug}` : null }
}

/** A typed date row as a dated line. A row needs a title and a start. */
export function typedDateItem(row: unknown, index: number): DateItem | null {
  const r = obj(row)
  const title = str(r?.title)
  const startsAt = isoOf(r?.startsAt)
  if (!r || !title || !startsAt) return null
  const endsAt = isoOf(r.endsAt)
  return { id: `typed-${str(r.id) ?? index}`, title, startsAt, endsAt: endsAt && endsAt >= startsAt ? endsAt : null, place: str(r.place), href: str(r.href) }
}

/** An ISO instant, or null for anything that is not a date. */
export function isoOf(value: unknown): string | null {
  const s = str(value)
  if (!s) return null
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

/** How long a dated line with no end counts as still on, in hours. A show that began an hour ago is still worth listing. */
export const DEFAULT_DURATION_HOURS = 3

/** Whether a dated line is still to come or on now. A line with no end is on for `DEFAULT_DURATION_HOURS` after it starts. */
export function isUpcoming(item: Pick<DateItem, 'startsAt' | 'endsAt'>, now: Date): boolean {
  const end = item.endsAt ? Date.parse(item.endsAt) : Date.parse(item.startsAt) + DEFAULT_DURATION_HOURS * 3_600_000
  return Number.isFinite(end) && end > now.getTime()
}

/** The lines still to come, soonest first, at most `limit`. */
export function upcomingDates(items: readonly (DateItem | null)[], now: Date, limit: number): DateItem[] {
  return items
    .filter((i): i is DateItem => i !== null && isUpcoming(i, now))
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
    .slice(0, Math.max(0, limit))
}

export interface DateParts {
  month: string
  day: string
  weekday: string
  /** "6 p.m." or "6:30 p.m."; empty for a line that starts at midnight with no end (a day with no time). */
  time: string
}

/** A start as the station's local month, day, weekday and time. */
export function datePartsOf(iso: string): DateParts {
  const d = new Date(iso)
  const parts = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { ...opts, timeZone: STATION_TIME_ZONE }).format(d)
  const hour = Number(parts({ hour: 'numeric', hour12: false }).replace(/\D/g, ''))
  const minute = Number(parts({ minute: '2-digit' }))
  let time = ''
  if (!(hour % 24 === 0 && minute === 0)) {
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    time = `${h12}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hour >= 12 && hour < 24 ? 'p.m.' : 'a.m.'}`
  }
  return { month: parts({ month: 'short' }), day: parts({ day: 'numeric' }), weekday: parts({ weekday: 'long' }), time }
}
