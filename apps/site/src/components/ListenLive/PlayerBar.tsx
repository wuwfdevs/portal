'use client'

import Link from 'next/link'
import React, { useRef, useState } from 'react'

import { progressWords } from '@/lib/player/track'
import { formatDuration } from '@/lib/format'

import { ListenSheet } from './ListenSheet'
import { PlayIcon, StatusLine } from './parts'
import { SKIP_SECONDS, usePlayer, usePlayerProgress } from './PlayerProvider'
import { useNowNext } from './useNowNext'

const iconButton = 'flex size-11 shrink-0 items-center justify-center rounded-sm text-surface-dark-text hover:text-surface'

/**
 * The site's player bar, at the bottom of every page once the reader has started anything (board 26). On a phone (below `lg`) it is
 * there from the start whenever the station has a stream, so Listen live is always one thumb-reach away, and its switcher button opens
 * `ListenSheet`; the header carries no Live button there. Before anything has played it asks for nothing (no now-playing request, no
 * audio). It is the one place audio is controlled, whether it is the live stream or a story, a show episode or a card's audio started from
 * elsewhere on the site. A spacer of the same height keeps it from covering the end of the page, so it never hides the footer's links
 * or a form.
 */
export const PlayerBar: React.FC = () => {
  const player = usePlayer()
  const { position, duration } = usePlayerProgress()
  const [sheetOpen, setSheetOpen] = useState(false)
  const switcher = useRef<HTMLButtonElement>(null)
  const live = player?.mode === 'live'
  const { onNow } = useNowNext(player?.started && live ? (player.current?.cadenceChannelId ?? null) : null)
  // Started: every width. Not yet: only a phone, and only if there is a stream to offer.
  if (!player || (!player.started && !player.current)) return null
  const { current, track, status } = player
  const idleOnDesktop = !player.started ? 'lg:hidden' : ''
  const playing = status === 'playing' || status === 'loading'
  const onDemand = player.mode === 'track' && track
  const name = onDemand ? track.title : (current?.name ?? '')
  const total = duration || track?.durationSeconds || 0

  return (
    <>
      <div aria-hidden="true" className={`h-20 ${idleOnDesktop}`} />
      <section
        aria-label={onDemand ? 'Audio player' : 'Live player'}
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-surface-dark-line bg-surface-dark text-surface shadow-3 ${idleOnDesktop}`}
      >
        <div className="container flex min-h-16 items-center gap-3 py-2 md:gap-5">
          <button
            aria-label={playing ? `Pause ${name}` : `Play ${name}`}
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-surface-dark"
            onClick={() => (onDemand ? player.toggleTrack(track) : player.toggle())}
            type="button"
          >
            <PlayIcon playing={playing} size={16} />
          </button>

          {onDemand ? (
            <>
              <button aria-label={`Back ${SKIP_SECONDS} seconds`} className={`${iconButton} hidden sm:flex`} onClick={() => player.skip(-SKIP_SECONDS)} type="button">
                <span aria-hidden="true" className="text-sm font-bold tabular-nums">−{SKIP_SECONDS}</span>
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-base leading-snug">
                  {track.href ? (
                    <Link className="text-surface hover:underline" href={track.href}>
                      {track.title}
                    </Link>
                  ) : (
                    track.title
                  )}
                </strong>
                <div className="flex items-center gap-2 text-sm text-surface-dark-text">
                  <span className="w-11 shrink-0 tabular-nums">{formatDuration(position) || '0:00'}</span>
                  <input
                    aria-label="Seek"
                    aria-valuetext={progressWords(position, total)}
                    className="h-6 min-w-0 flex-1 accent-wuwf-lime"
                    disabled={total <= 0}
                    max={Math.max(1, Math.floor(total))}
                    min={0}
                    onChange={(e) => player.seek(Number(e.target.value))}
                    type="range"
                    value={Math.min(Math.floor(position), Math.max(1, Math.floor(total)))}
                  />
                  <span className="w-11 shrink-0 text-right tabular-nums">{formatDuration(total) || '–:––'}</span>
                </div>
                <span className="sr-only">
                  {track.credit ? `${track.credit}. ` : ''}
                  <StatusLine status={status} />
                </span>
              </div>
              <button aria-label={`Forward ${SKIP_SECONDS} seconds`} className={`${iconButton} hidden sm:flex`} onClick={() => player.skip(SKIP_SECONDS)} type="button">
                <span aria-hidden="true" className="text-sm font-bold tabular-nums">+{SKIP_SECONDS}</span>
              </button>
              {current && (
                <button className="hidden min-h-11 shrink-0 items-center font-bold text-surface underline lg:inline-flex" onClick={() => player.play()} type="button">
                  Listen live
                </button>
              )}
            </>
          ) : (
            <>
              <span className="hidden shrink-0 items-center gap-1.5 rounded-pill bg-on-air-red px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-surface sm:inline-flex">
                Live
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <strong className="truncate text-base leading-snug">{onNow?.name ?? current?.name}</strong>
                <span className="truncate text-sm text-surface-dark-text">
                  {current?.short}
                  {' · '}
                  <StatusLine status={status} />
                </span>
              </div>
              <button
                aria-expanded={sheetOpen}
                aria-haspopup="dialog"
                aria-label="Streams and what is on now"
                className={`${iconButton} lg:hidden`}
                onClick={() => setSheetOpen(true)}
                ref={switcher}
                type="button"
              >
                <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
                  <path d="M6 15l6-6 6 6" />
                </svg>
              </button>
            </>
          )}

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
          {!onDemand && (
            <Link className="hidden min-h-11 shrink-0 items-center font-bold text-surface underline sm:inline-flex" href="/schedule">
              Schedule
            </Link>
          )}
          {/* On a phone the live bar stays whether or not it is playing, so Close would only duplicate Pause: it is for the desktop and for a story's audio. */}
          <button aria-label="Close the player" className={`${iconButton} ${onDemand ? '' : 'max-lg:hidden'}`} onClick={() => player.close()} type="button">
            <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </section>
      {sheetOpen && (
        <ListenSheet
          onClose={() => {
            setSheetOpen(false)
            switcher.current?.focus()
          }}
        />
      )}
    </>
  )
}
