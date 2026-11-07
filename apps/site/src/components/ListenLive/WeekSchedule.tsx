'use client'

import React, { useEffect, useState } from 'react'

import { dayNames, formatClock, programsOn, type ScheduledProgram } from '@/lib/live/schedule'

import { useLivePlayer } from './PlayerProvider'

const chip = 'inline-flex min-h-11 items-center rounded-pill border px-4 text-base font-bold'

/**
 * The week's schedule on the Listen live page (board 26), in Central time, for the channel the player is set to: a
 * button per day (today first selected), the day's programs in order, and "On now" on the one airing. It follows the
 * player's channel, so choosing HD2 above shows HD2's week here. The programs come from NPR Cadence through the site's
 * server (cached 15 minutes); nobody edits them on the site.
 */
export const WeekSchedule: React.FC<{ weeks: Record<string, ScheduledProgram[]>; days: string[]; today: string }> = ({ weeks, days, today }) => {
  const player = useLivePlayer()
  const [day, setDay] = useState(today)
  const [now, setNow] = useState(() => Date.now())

  // Keep "On now" right while the page stays open.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const channel = player?.current
  if (!channel?.cadenceChannelId) return null
  const week = weeks[channel.key] ?? []
  const programs = programsOn(week, day)

  return (
    <section aria-labelledby="schedule-title" className="border-y border-rule bg-surface-2">
      <div className="container flex flex-col gap-6 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <h2 className="font-serif text-3xl font-bold text-ink md:text-4xl" id="schedule-title">
              Schedule
            </h2>
            <p className="text-sm text-ink-3">Central time · {channel.name}</p>
          </div>
          <div aria-label="Choose a day" className="flex flex-wrap gap-2" role="group">
            {days.map((d) => {
              const on = d === day
              const names = dayNames(d)
              return (
                <button
                  aria-label={names.long + (d === today ? ', today' : '')}
                  aria-pressed={on}
                  className={`${chip} ${on ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:bg-surface-3'}`}
                  key={d}
                  onClick={() => setDay(d)}
                  type="button"
                >
                  {d === today ? 'Today' : names.short}
                </button>
              )
            })}
          </div>
        </div>

        {programs.length === 0 ? (
          <p className="rounded-md border border-rule bg-surface p-6 text-base text-ink-2">
            {week.length === 0 ? 'The schedule is not available right now. The stream above still plays.' : 'Nothing is scheduled on this day.'}
          </p>
        ) : (
          <ol aria-label={`${dayNames(day).long}, ${channel.name}`} className="overflow-hidden rounded-md border border-rule bg-surface">
            {programs.map((p, i) => {
              const live = Date.parse(p.start) <= now && now < Date.parse(p.end)
              return (
                <li
                  aria-current={live ? 'true' : undefined}
                  className={`grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-4 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:px-6 ${i ? 'border-t border-rule' : ''} ${live ? 'bg-wuwf-blue-100' : ''}`}
                  key={`${p.start}-${p.name}`}
                >
                  <span className="text-sm tabular-nums text-ink-2">{formatClock(p.start)}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <strong className="text-lg leading-snug text-ink">
                      {p.link ? (
                        <a className="text-ink" href={p.link} rel="noopener" target="_blank">
                          {p.name}
                        </a>
                      ) : (
                        p.name
                      )}
                    </strong>
                    {p.description && <span className="line-clamp-2 text-sm text-ink-3">{p.description}</span>}
                  </span>
                  {live && (
                    <span className="col-start-2 inline-flex min-h-6 w-fit items-center rounded-pill bg-on-air-red px-2.5 text-xs font-bold uppercase tracking-widest text-surface md:col-start-3">
                      On now
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
