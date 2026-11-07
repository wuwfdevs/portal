/**
 * "On now" and "Up next" for a live channel (board 26). Pure: Cadence's widget data in, two programs out.
 *
 * The schedule comes from NPR Cadence, the tool WUWF schedules each channel in (its schedule pages embed Cadence's
 * widgets). The stream cannot supply this: it carries no titles (checked 2026-11-07), and could not say what is next.
 * Cadence's data address is not documented; it is the one its own "now" widget reads. See ROADMAP.md, board 26.
 *
 * Rules: never show a program after its end; if the cached "up next" has started, it is on now; "up next" is left
 * out when it is the same program continuing; anything malformed is left out rather than guessed.
 */

export type LiveProgram = {
  name: string
  /** ISO instants, UTC. */
  start: string
  end: string
  link: string | null
}

export type NowNext = { onNow: LiveProgram | null; upNext: LiveProgram | null }

export const EMPTY_NOW_NEXT: NowNext = { onNow: null, upNext: null }

/** WUWF's schedule is kept in Central time; times are shown in it whatever the reader's own zone. */
export const STATION_TIME_ZONE = 'America/Chicago'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCadenceChannelId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function instant(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/** Only an http(s) link is kept; Cadence sometimes stores "http://wuwf.org/...", which is upgraded. */
function safeLink(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const u = new URL(value.trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
    u.protocol = 'https:'
    return u.toString()
  } catch {
    return null
  }
}

function program(raw: unknown): LiveProgram | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const nested = r.program && typeof r.program === 'object' ? (r.program as Record<string, unknown>) : {}
  const nameRaw = r.programName ?? nested.programName ?? nested.name
  const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 120) : ''
  const start = instant((r.start as Record<string, unknown> | undefined)?.utc)
  const end = instant((r.end as Record<string, unknown> | undefined)?.utc)
  if (!name || !start || !end || Date.parse(end) <= Date.parse(start)) return null
  return { name, start, end, link: safeLink(r.programLink) }
}

/** Reads the widget response. Never throws. */
export function parseCadenceWidget(json: unknown): NowNext {
  if (!json || typeof json !== 'object') return EMPTY_NOW_NEXT
  const j = json as Record<string, unknown>
  return { onNow: program(j.onNow), upNext: program(j.upNext) }
}

/**
 * What is on at `now`, from data that may be up to a few minutes old: a program that has ended is dropped, and an
 * "up next" that has started moves up. Nothing is invented to fill a gap.
 */
export function currentPrograms(data: NowNext, now: number): NowNext {
  const live = (p: LiveProgram | null) => (p && Date.parse(p.start) <= now && now < Date.parse(p.end) ? p : null)
  const future = (p: LiveProgram | null) => (p && now < Date.parse(p.start) ? p : null)
  const onNow = live(data.onNow) ?? live(data.upNext)
  let upNext = onNow === data.upNext ? null : future(data.upNext)
  // A program that simply continues (HD2's all-day "Classical 24", day after day) is not news: no "Up next".
  if (onNow && upNext && upNext.name === onNow.name) upNext = null
  return { onNow, upNext }
}

/** The next moment the answer changes (an end or a start), so a page can refresh then, not only on a timer. */
export function nextChange(data: NowNext, now: number): number | null {
  const times = [data.onNow?.end, data.upNext?.start, data.upNext?.end]
    .filter((t): t is string => Boolean(t))
    .map((t) => Date.parse(t))
    .filter((t) => t > now)
  return times.length ? Math.min(...times) : null
}

const clock = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: STATION_TIME_ZONE })

/** "10:00 p.m." in station time; AP style. */
export function formatClock(iso: string): string {
  return clock
    .format(new Date(iso))
    .replace(/\s?AM$/, ' a.m.')
    .replace(/\s?PM$/, ' p.m.')
    .replace(/ /g, ' ')
}

/** "10:00 – 11:59 p.m.", or "11:00 p.m. – 5:00 a.m." across noon or midnight. */
export function formatSpan(p: Pick<LiveProgram, 'start' | 'end'>): string {
  const a = formatClock(p.start)
  const b = formatClock(p.end)
  const suffix = (s: string) => s.slice(-4)
  return suffix(a) === suffix(b) ? `${a.slice(0, -5)} – ${b}` : `${a} – ${b}`
}
