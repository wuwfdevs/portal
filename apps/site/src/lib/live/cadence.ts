import { EMPTY_NOW_NEXT, isCadenceChannelId, parseCadenceWeek, parseCadenceWidget, type NowNext, type ScheduledProgram } from './schedule'

/**
 * Reads "On now" and "Up next" for one channel from NPR Cadence, on the server only (Cadence sends no CORS header, and
 * one cached read serves every listener). Never throws: a slow or failed read returns the last good answer for that
 * channel, or nothing. The site must stay usable when the schedule is down.
 *
 * The address is the one Cadence's own "now" widget reads; it is not documented, so ask NPR before relying on it in
 * production (ROADMAP.md, board 26).
 */

const CADENCE = 'https://cadence.nprstations.org/api/cadence/widget/'
const TIMEOUT_MS = 4000
/** Cadence itself says max-age=15; a minute is plenty for a schedule and keeps us a light client. */
export const SCHEDULE_REVALIDATE_SECONDS = 60

const lastGood = new Map<string, NowNext>()

export async function fetchNowNext(channelId: string, fetchImpl: typeof fetch = fetch): Promise<{ data: NowNext; fresh: boolean }> {
  if (!isCadenceChannelId(channelId)) return { data: EMPTY_NOW_NEXT, fresh: false }
  try {
    const res = await fetchImpl(`${CADENCE}${channelId}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate: SCHEDULE_REVALIDATE_SECONDS, tags: ['live-schedule'] },
    } as RequestInit)
    if (!res.ok) throw new Error(`Cadence answered ${res.status}`)
    const data = parseCadenceWidget(await res.json())
    if (data.onNow || data.upNext) lastGood.set(channelId, data)
    return { data, fresh: true }
  } catch (error) {
    console.warn(`Live schedule unavailable for ${channelId}: ${(error as Error).message}`)
    return { data: lastGood.get(channelId) ?? EMPTY_NOW_NEXT, fresh: false }
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/
const lastGoodWeek = new Map<string, ScheduledProgram[]>()

/**
 * One channel's programs from `startDate` to `endDate` (station dates, inclusive), as Cadence's weekly widget asks for
 * them: a POST to the same widget address with the channel and the dates in the body. Server only; never throws; the
 * last good week for that channel and range is kept for when Cadence fails. Cache it with `unstable_cache` at the
 * caller (a POST is not cached by Next's fetch).
 */
export async function fetchWeek(
  channelId: string,
  startDate: string,
  endDate: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ programs: ScheduledProgram[]; fresh: boolean }> {
  if (!isCadenceChannelId(channelId) || !DATE.test(startDate) || !DATE.test(endDate)) return { programs: [], fresh: false }
  const key = `${channelId}:${startDate}:${endDate}`
  try {
    const res = await fetchImpl(CADENCE, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ channelId, startDate, endDate, from: 0, size: 1000 }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Cadence answered ${res.status}`)
    const programs = parseCadenceWeek(await res.json())
    if (programs.length) lastGoodWeek.set(key, programs)
    return { programs, fresh: true }
  } catch (error) {
    console.warn(`Week schedule unavailable for ${channelId}: ${(error as Error).message}`)
    return { programs: lastGoodWeek.get(key) ?? [], fresh: false }
  }
}

/**
 * The week, cached for 15 minutes across requests (Next's `unstable_cache`). Only a fresh answer is cached: a failed read
 * throws inside the cache, so it is never stored, and the caller gets the last good week (or nothing) instead.
 */
export async function cachedWeek(channelId: string, startDate: string, endDate: string): Promise<ScheduledProgram[]> {
  const { unstable_cache } = await import('next/cache')
  let fallback: ScheduledProgram[] = []
  const read = unstable_cache(
    async (id: string, start: string, end: string) => {
      const r = await fetchWeek(id, start, end)
      if (!r.fresh) {
        fallback = r.programs
        throw new Error('stale')
      }
      return r.programs
    },
    ['live-week'],
    { revalidate: 900, tags: ['live-schedule'] },
  )
  try {
    return await read(channelId, startDate, endDate)
  } catch {
    return fallback
  }
}

/** For tests. */
export function clearLastGood() {
  lastGood.clear()
  lastGoodWeek.clear()
}
