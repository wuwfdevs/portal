'use client'

import Link from 'next/link'
import React, { useEffect, useId, useRef, useState } from 'react'

import { useLivePlayer } from './PlayerProvider'
import { PlayIcon, StatusLine } from './parts'
import { useNowNext } from './useNowNext'

/**
 * Listen live in the header (board 26, revised). Pressing the button starts the stream right there, with no page in
 * between: it is the same site-wide player, so it keeps playing as the reader moves around. The small arrow beside it
 * opens a panel with the channels, what is on now and next, the volume and a link to the broadcast schedule.
 */
export const HeaderListen: React.FC<{ label: string }> = ({ label }) => {
  const player = useLivePlayer()
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const panelId = useId()
  const { onNow, upNext } = useNowNext(player && (open || player.started) ? player.current.cadenceChannelId : null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onPointer)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onPointer)
    }
  }, [open])

  if (!player) return null
  const { current, status } = player
  const playing = status === 'playing' || status === 'loading'

  return (
    <div className="relative flex items-center" ref={root}>
      <button
        aria-label={playing ? `Pause ${current.name}` : `${label}: play ${current.name}`}
        className="inline-flex min-h-11 items-center gap-2 rounded-sm px-2 text-base font-bold text-ink hover:bg-surface-2"
        onClick={() => player.toggle()}
        type="button"
      >
        {playing ? (
          <PlayIcon playing size={14} />
        ) : (
          <span aria-hidden="true" className="size-2.5 rounded-full bg-on-air-red" />
        )}
        <span className="hidden sm:inline">{playing ? 'Pause' : label}</span>
        <span className="sm:hidden">{playing ? 'Pause' : 'Live'}</span>
      </button>
      <button
        aria-controls={`${panelId}-panel`}
        aria-expanded={open}
        aria-label="Channels and what is on now"
        className="flex size-9 items-center justify-center rounded-sm text-ink hover:bg-surface-2"
        onClick={() => setOpen((o) => !o)}
        type="button"
      >
        <svg aria-hidden="true" className={open ? 'rotate-180' : ''} fill="none" height="12" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" width="12">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-1 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-4 rounded-md border border-rule bg-surface p-5 shadow-3"
          id={`${panelId}-panel`}
        >
          {player.channels.length > 1 && (
            <div aria-label="Choose a stream" className="flex flex-wrap gap-2" role="group">
              {player.channels.map((c) => {
                const on = c.key === current.key
                return (
                  <button
                    aria-pressed={on}
                    className={`inline-flex min-h-11 items-center rounded-pill border px-4 text-sm font-bold ${on ? 'border-ink bg-ink text-surface' : 'border-rule-strong bg-surface text-ink hover:bg-surface-2'}`}
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
          <div className="flex flex-col gap-1">
            <p className="text-xs font-bold uppercase tracking-widest text-ink-3">On now · {current.name}</p>
            <p className="font-serif text-xl font-bold leading-snug text-ink">{onNow?.name ?? current.name}</p>
            {upNext && <p className="text-sm text-ink-2">Up next: {upNext.name}</p>}
            <p className="text-sm text-ink-3">
              <StatusLine status={status} />
            </p>
          </div>
          <label className="flex items-center gap-2.5 text-sm text-ink-2">
            Volume
            <input
              aria-label="Volume"
              className="w-full accent-wuwf-blue-700"
              max={100}
              min={0}
              onChange={(e) => player.setVolume(Number(e.target.value) / 100)}
              type="range"
              value={Math.round(player.volume * 100)}
            />
          </label>
          <Link className="inline-flex min-h-11 items-center font-bold text-wuwf-blue-700" href="/schedule" onClick={() => setOpen(false)}>
            Broadcast schedule
          </Link>
        </div>
      )}
    </div>
  )
}
