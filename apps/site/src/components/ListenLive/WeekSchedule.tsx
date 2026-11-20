'use client'

import React, { useEffect, useState } from 'react'

import { dayNames, formatClock, programsOn, type ScheduledProgram } from '@/lib/live/schedule'

import { useLivePlayer } from './PlayerProvider'

const chip = 'inline-flex min-h-11 items-center rounded-pill border px-4 text-base font-bold'
const chipOn = '[background:var(--tone-button)] [color:var(--tone-button-text)] [border-color:var(--tone-button)]'
const chipOff = '[background:var(--tone-card)] [color:var(--tone-text)] [border-color:var(--tone-card-rule)] hover:opacity-80'

/**
 * The week's schedule (board 26), the Broadcast schedule block's body, in Central time, for the channel the player is set to: a
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
  if (!channel) return null
  const week = weeks[channel.key] ?? []
  const programs = programsOn(week, day)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm [color:var(--tone-muted)]">Central time · {channel.name}</p>
        <div aria-label="Choose a stream" className="flex flex-wrap gap-2" role="group">
          {player?.channels.map((c) => {
            const on = c.key === channel.key
            return (
              <button aria-pressed={on} className={`${chip} ${on ? chipOn : chipOff}`} key={c.key} onClick={() => player.select(c.key)} type="button">
                {c.name}
              </button>
            )
          })}
        </div>
        <div aria-label="Choose a day" className="flex flex-wrap gap-2" role="group">
          {days.map((d) => {
            const on = d === day
            const names = dayNames(d)
            return (
              <button
                aria-label={names.long + (d === today ? ', today' : '')}
                aria-pressed={on}
                className={`${chip} ${on ? chipOn : chipOff}`}
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
        <p className="rounded-md border p-6 text-base [background:var(--tone-card)] [border-color:var(--tone-card-rule)] [color:var(--tone-text)]">
          {!channel.cadenceChannelId
            ? `There is no schedule for ${channel.name} here. Listen live still plays.`
            : week.length === 0
              ? 'The schedule is not available right now. Listen live still plays.'
              : 'Nothing is scheduled on this day.'}
        </p>
      ) : (
        <ol aria-label={`${dayNames(day).long}, ${channel.name}`} className="overflow-hidden rounded-md border [background:var(--tone-card)] [border-color:var(--tone-card-rule)] [color:var(--tone-text)]">
          {programs.map((p, i) => {
            const live = Date.parse(p.start) <= now && now < Date.parse(p.end)
            return (
              <li
                aria-current={live ? 'true' : undefined}
                className={`grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-4 py-4 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:px-6 ${i ? 'border-t [border-color:var(--tone-card-rule)]' : ''} ${live ? '[background:var(--tone-tint)]' : ''}`}
                key={`${p.start}-${p.name}`}
              >
                <span className="text-sm tabular-nums [color:var(--tone-muted)]">{formatClock(p.start)}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <strong className="text-lg leading-snug">
                    {p.link ? (
                      <a href={p.link} rel="noopener" target="_blank">
                        {p.name}
                      </a>
                    ) : (
                      p.name
                    )}
                  </strong>
                  {p.description && <span className="line-clamp-2 text-sm [color:var(--tone-muted)]">{p.description}</span>}
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
  )
}
