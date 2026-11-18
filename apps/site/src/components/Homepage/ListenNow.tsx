'use client'

import Link from 'next/link'
import React from 'react'

import { PlayIcon, StatusLine } from '@/components/ListenLive/parts'
import { useLivePlayer } from '@/components/ListenLive/PlayerProvider'
import { useNowNext } from '@/components/ListenLive/useNowNext'
import { cn } from '@/utilities/ui'

/**
 * "Listen now" on the home page (board 1), under The Briefing: what is on the air, the channels, and one button that starts the stream. It is
 * the site's one player (the same as the header's Listen live), so the stream keeps playing as the reader moves around and the bar at the bottom
 * takes over. What is on now and next comes from the schedule through the site (`useNowNext`), never invented: until it answers, or on a channel
 * with no schedule, the card shows the channel's own name. With no channels set there is no player, and this draws nothing, not an empty box.
 */
export const ListenNow: React.FC<{ className?: string }> = ({ className }) => {
  const player = useLivePlayer()
  const { onNow, upNext } = useNowNext(player ? player.current.cadenceChannelId : null)
  if (!player) return null

  const { current, status } = player
  const playing = status === 'playing' || status === 'loading'

  return (
    <section aria-label="Listen now" className={cn('flex flex-col gap-3 rounded-sm bg-surface-dark p-5 text-surface', className)}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-pill bg-on-air-red px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest text-surface">Live</span>
        <p className="text-sm text-surface-dark-text">On {current.name} now</p>
      </div>
      <h2 className="font-serif text-2xl font-bold leading-tight text-surface">{onNow?.name ?? current.name}</h2>
      {upNext && <p className="text-sm text-surface-dark-text">Up next: {upNext.name}</p>}
      {current.description && <p className="text-sm text-surface-dark-text">{current.description}</p>}

      {player.channels.length > 1 && (
        <div aria-label="Choose a stream" className="flex flex-wrap gap-2" role="group">
          {player.channels.map((c) => {
            const on = c.key === current.key
            return (
              <button
                aria-pressed={on}
                className={cn(
                  'inline-flex min-h-11 items-center rounded-pill border px-4 text-sm font-bold',
                  on ? 'border-surface bg-surface text-surface-dark' : 'border-surface-dark-line text-surface hover:bg-surface-dark-hover',
                )}
                key={c.key}
                onClick={() => player.select(c.key)}
                type="button"
              >
                {c.short}
              </button>
            )
          })}
        </div>
      )}

      <button
        aria-label={`${playing ? 'Pause' : 'Listen live'}: ${current.name}`}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-sm bg-wuwf-lime px-4 text-base font-bold text-surface-dark hover:bg-wuwf-lime-600"
        onClick={() => player.toggle()}
        type="button"
      >
        <PlayIcon playing={playing} size={14} />
        {playing ? 'Pause' : 'Listen live'}
      </button>
      <p className="text-sm text-surface-dark-text">
        <StatusLine status={status} />
      </p>
      <Link className="inline-flex min-h-11 items-center self-start text-sm font-bold text-wuwf-lime underline" href="/schedule">
        Broadcast schedule
      </Link>
    </section>
  )
}
