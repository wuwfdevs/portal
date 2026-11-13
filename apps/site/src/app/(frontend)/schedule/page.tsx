import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import React from 'react'

import { WeekSchedule } from '@/components/ListenLive/WeekSchedule'
import { cachedWeek } from '@/lib/live/cadence'
import { liveChannels, type LiveChannel } from '@/lib/live/channels'
import { stationDate, stationWeek, type ScheduledProgram } from '@/lib/live/schedule'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'Broadcast schedule',
  description: 'What is on WUWF 88.1, HD2 Classical and HD3, day by day.',
}

/**
 * The broadcast schedule (board 26, revised). Listening itself now starts from the header's Listen live button, so this
 * page is only the schedule and the other ways to listen. The streams and the cards come from the Listen live settings;
 * the programs from NPR Cadence through the site's server.
 */
/** On now for each channel, and this week's programs, in station time. Outside the component: it reads the clock. */
async function loadSchedules(channels: LiveChannel[]) {
  const now = Date.now()
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

export default async function ListenPage() {
  const settings = await getCachedGlobal('listen-live', 0)()
  const channels = liveChannels(settings?.channels)
  if (channels.length === 0) notFound()

  // The first answers are rendered on the server, so "On now" and the schedule are there before any script runs.
  const { weeks, days, today } = await loadSchedules(channels)
  const ways = settings?.otherWays ?? []

  return (
    <>
      <section aria-labelledby="listen-title" className="container flex flex-col gap-4 pt-12">
        <span className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">WUWF 88.1 · Pensacola</span>
        <h1 className="font-serif text-4xl font-bold leading-tight text-ink md:text-6xl" id="listen-title">
          Broadcast schedule
        </h1>
        <p className="max-w-[40rem] text-lg text-ink-2">
          Press <strong>Listen live</strong> at the top of any page to start the stream. It keeps playing while you browse.
        </p>
      </section>

      <WeekSchedule days={days} today={today} weeks={weeks} />

      {ways.length > 0 && (
        <section aria-labelledby="ways-title" className="container flex flex-col gap-6 py-14" id="ways">
          <h2 className="font-serif text-3xl font-bold text-ink md:text-4xl" id="ways-title">
            Other ways to listen
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ways.map((w) => (
              <li className="flex flex-col gap-2 rounded-md border border-rule p-6" key={w.id ?? w.title}>
                <h3 className="font-serif text-xl font-bold text-ink">{w.title}</h3>
                <p className="text-base text-ink-2">{w.text}</p>
                {w.linkUrl && w.linkLabel && (
                  <a className="font-bold" href={w.linkUrl}>
                    {w.linkLabel}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
