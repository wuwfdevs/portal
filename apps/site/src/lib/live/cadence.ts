import { EMPTY_NOW_NEXT, isCadenceChannelId, parseCadenceWidget, type NowNext } from './schedule'

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

/** For tests. */
export function clearLastGood() {
  lastGood.clear()
}
