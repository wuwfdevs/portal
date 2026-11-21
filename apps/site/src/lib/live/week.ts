import { unstable_cache } from 'next/cache'

import { getCachedGlobal } from '@/utilities/getGlobals'

import { SCHEDULE_REVALIDATE_SECONDS, cachedWeek } from './cadence'
import { liveChannels } from './channels'
import { stationDate, stationWeek, type ScheduledProgram } from './schedule'

/**
 * What the broadcast schedule block draws: this week's programs for every channel that has a Cadence ID, the seven days, and today's date, in station time.
 * The streams come from the Listen live settings (through the cache their save refreshes); the programs from NPR Cadence through the site's server.
 *
 * The clock is read through a cache with the same one-minute window as the schedule, so a page holding the block is regenerated at least that often and
 * "today" is never a day behind. Blocks import this file only when they draw (it loads the Payload config through the global helper).
 */
export interface WeekScheduleData {
  weeks: Record<string, ScheduledProgram[]>
  days: string[]
  today: string
}

const clock = unstable_cache(async () => Date.now(), ['section-schedule-clock'], { revalidate: SCHEDULE_REVALIDATE_SECONDS, tags: ['section-data'] })

/** The week, or null when no channel is set up (the block then draws nothing, as the page used to answer not found). */
export async function loadWeekSchedule(): Promise<WeekScheduleData | null> {
  const settings = await getCachedGlobal('listen-live', 0)()
  const channels = liveChannels(settings?.channels)
  if (channels.length === 0) return null
  const now = await clock()
  const { startDate, endDate, days } = stationWeek(now)
  const weeks: Record<string, ScheduledProgram[]> = {}
  await Promise.all(
    channels.map(async (c) => {
      if (!c.cadenceChannelId) return
      weeks[c.key] = await cachedWeek(c.cadenceChannelId, startDate, endDate)
    }),
  )
  return { weeks, days, today: stationDate(now).date }
}
