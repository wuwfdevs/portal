'use client'

import Link from 'next/link'
import React from 'react'

import { useLivePlayer } from './PlayerProvider'
import { PlayIcon, StatusLine } from './parts'
import { useNowNext } from './useNowNext'

/**
 * The bar at the bottom of every page once the reader has started the stream (board 26). Not shown before then. It is the
 * keep-in-reach control once the header has scrolled away. A spacer of the same height keeps it from covering
 * the end of the page, so it never hides the footer's links or a form.
 */
export const PlayerBar: React.FC = () => {
  const player = useLivePlayer()
  const { onNow } = useNowNext(player?.started ? player.current.cadenceChannelId : null)
  if (!player?.started) return null
  const { current, status } = player
  const playing = status === 'playing' || status === 'loading'

  return (
    <>
      <div aria-hidden="true" className="h-20" />
      <section aria-label="Live player" className="fixed inset-x-0 bottom-0 z-40 border-t border-surface-dark-line bg-surface-dark text-surface shadow-3">
        <div className="container flex min-h-16 items-center gap-3 py-2 md:gap-5">
          <button
            aria-label={playing ? `Pause ${current.name}` : `Play ${current.name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-surface-dark"
            onClick={() => player.toggle()}
            type="button"
          >
            <PlayIcon playing={playing} size={16} />
          </button>
          <span className="hidden shrink-0 items-center gap-1.5 rounded-pill bg-on-air-red px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-surface sm:inline-flex">
            Live
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <strong className="truncate text-base leading-snug">{onNow?.name ?? current.name}</strong>
            <span className="truncate text-sm text-surface-dark-text">
              {current.short}
              {' · '}
              <StatusLine status={status} />
            </span>
          </div>
          <label className="hidden items-center gap-2 text-sm text-surface-dark-text md:flex">
            Volume
            <input
              aria-label="Volume"
              className="w-28 accent-wuwf-lime"
              max={100}
              min={0}
              onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
              type="range"
              value={Math.round(player.volume * 100)}
            />
          </label>
          <Link className="hidden min-h-11 shrink-0 items-center font-bold text-surface underline sm:inline-flex" href="/schedule">
            Schedule
          </Link>
          <button
            aria-label="Close the player"
            className="flex size-11 shrink-0 items-center justify-center rounded-sm text-surface-dark-text hover:text-surface"
            onClick={() => player.close()}
            type="button"
          >
            <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </section>
    </>
  )
}
