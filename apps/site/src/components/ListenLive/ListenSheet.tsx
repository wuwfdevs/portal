'use client'

import Link from 'next/link'
import React, { useRef } from 'react'

import { useModalDialog } from '@/utilities/useModalDialog'

import { PlayIcon, StatusLine } from './parts'
import { usePlayer } from './PlayerProvider'
import { useNowNext } from './useNowNext'

/**
 * The phone's stream switcher: a sheet that rises from the player bar (below `lg`; the desktop header keeps its own panel).
 * It lists every stream with its own play button, so choosing a stream is one tap and starts it, and it says what is on now and
 * up next on the selected one. It is a modal dialog: the page behind does not scroll, focus stays inside, Escape, the scrim
 * or the close button close it, and following the schedule link does too. Closing it never stops the audio. Volume is not
 * here: on a phone it is the device's.
 */
export const ListenSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const player = usePlayer()
  const sheet = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useModalDialog({ open: true, onClose, container: sheet, initialFocus: closeButton })
  const { onNow, upNext } = useNowNext(player?.current?.cadenceChannelId ?? null)
  if (!player?.current) return null

  const { channels, current, mode, status } = player
  const live = mode === 'live'
  const active = status === 'playing' || status === 'loading'

  return (
    <div aria-label="Listen live" aria-modal="true" className="fixed inset-0 z-50 lg:hidden" ref={sheet} role="dialog">
      <div aria-hidden="true" className="absolute inset-0 bg-surface-dark/70" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col rounded-t-xl bg-surface-dark text-surface shadow-3">
        <div className="container flex min-h-16 shrink-0 items-center justify-between border-b border-surface-dark-line">
          <span className="font-serif text-xl font-bold">Listen live</span>
          <button aria-label="Close" className="-mr-2 flex size-11 items-center justify-center rounded-sm text-surface-dark-text hover:text-surface" onClick={onClose} type="button">
            <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeWidth="2.2" viewBox="0 0 24 24" width="20">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto overscroll-contain pb-6">
          <div className="container flex flex-col gap-1 py-5">
            <p className="text-xs font-bold uppercase tracking-widest text-surface-dark-text">On now · {current.name}</p>
            <p className="font-serif text-2xl font-bold leading-snug">{onNow?.name ?? current.name}</p>
            {upNext && <p className="text-base text-surface-dark-text">Up next: {upNext.name}</p>}
            <p className="text-sm text-surface-dark-text">
              <StatusLine status={live ? status : 'idle'} />
            </p>
          </div>

          <ul aria-label="Streams" className="border-t border-surface-dark-line">
            {channels.map((c) => {
              const selected = live && c.key === current.key
              const playingThis = selected && active
              return (
                <li className="border-b border-surface-dark-line" key={c.key}>
                  <button
                    aria-pressed={playingThis}
                    className="container flex min-h-16 w-full items-center gap-4 py-2 text-left hover:bg-surface-dark-line/40"
                    onClick={() => player.toggle(c.key)}
                    type="button"
                  >
                    <span className={`flex size-11 shrink-0 items-center justify-center rounded-full ${playingThis ? 'bg-surface text-surface-dark' : 'bg-on-air-red text-surface'}`}>
                      <PlayIcon playing={playingThis} size={16} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-base font-bold leading-snug">{c.name}</span>
                      {c.description && <span className="text-sm text-surface-dark-text">{c.description}</span>}
                    </span>
                    <span className="sr-only">{playingThis ? 'Pause' : 'Play'}</span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="container pt-2">
            <Link className="inline-flex min-h-11 items-center font-bold text-surface underline" href="/schedule" onClick={onClose}>
              Broadcast schedule
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
