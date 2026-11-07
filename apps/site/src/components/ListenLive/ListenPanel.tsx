'use client'

import React from 'react'

import { formatClock, formatSpan, type NowNext } from '@/lib/live/schedule'

import { useLivePlayer } from './PlayerProvider'
import { PlayIcon, StatusLine } from './parts'
import { useNowNext } from './useNowNext'

const chip = 'inline-flex min-h-11 items-center rounded-pill border px-4 text-base font-bold'

/**
 * The full player on the Listen live page (board 26): the channels, a large play button, what is on now and next, and
 * the volume. It drives the same player as the bar, so starting here keeps playing on every other page.
 */
export const ListenPanel: React.FC<{ initial: Record<string, NowNext> }> = ({ initial }) => {
  const player = useLivePlayer()
  const current = player?.current
  const { onNow, upNext } = useNowNext(current?.cadenceChannelId ?? null, current ? initial[current.key] : undefined)
  if (!player || !current) return null
  const playing = player.status === 'playing' || player.status === 'loading'

  return (
    <div className="flex min-w-0 flex-col gap-6 rounded-md bg-surface-dark p-6 text-surface md:p-8">
      {player.channels.length > 1 && (
        <div aria-label="Choose a stream" className="flex flex-wrap gap-2" role="group">
          {player.channels.map((c) => {
            const on = c.key === current.key
            return (
              <button
                aria-pressed={on}
                className={`${chip} ${on ? 'border-surface bg-surface text-surface-dark' : 'border-surface-dark-line bg-transparent text-surface hover:bg-surface-dark-hover'}`}
                key={c.key}
                onClick={() => player.select(c.key)}
                type="button"
              >
                {c.name}
              </button>
            )
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <button
          aria-label={playing ? `Pause ${current.name}` : `Play ${current.name}`}
          className="flex size-22 shrink-0 items-center justify-center rounded-full bg-surface text-surface-dark"
          onClick={() => player.toggle()}
          type="button"
        >
          <PlayIcon playing={playing} size={30} />
        </button>
        <div className="flex min-w-0 flex-1 basis-72 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="inline-flex min-h-6 items-center gap-1.5 rounded-pill bg-on-air-red px-2.5 text-xs font-bold uppercase tracking-widest text-surface">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-surface" />
              Live
            </span>
            <span className="text-sm text-surface-dark-text">
              <StatusLine status={player.status} />
            </span>
          </div>
          <p className="font-serif text-3xl font-bold leading-tight md:text-4xl">
            {onNow ? (
              onNow.link ? (
                <a className="text-surface underline-offset-4 hover:underline" href={onNow.link} rel="noopener" target="_blank">
                  {onNow.name}
                </a>
              ) : (
                onNow.name
              )
            ) : (
              current.name
            )}
          </p>
          <p className="text-base text-surface-dark-text">
            {onNow ? `${formatSpan(onNow)} · ${current.name}` : (current.description ?? 'Live')}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-7 gap-y-4 border-t border-surface-dark-line pt-5">
        <label className="flex items-center gap-2.5 text-sm text-surface-dark-text">
          Volume
          <input
            aria-label="Volume"
            className="w-40 accent-wuwf-lime"
            max={100}
            min={0}
            onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
            type="range"
            value={Math.round(player.volume * 100)}
          />
        </label>
        {upNext && (
          <p className="text-sm text-surface-dark-text">
            Up next: <strong className="text-surface">{upNext.name}</strong> at {formatClock(upNext.start)}
          </p>
        )}
      </div>
    </div>
  )
}
