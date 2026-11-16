'use client'

import React from 'react'

import { formatDuration } from '@/lib/format'
import type { Track } from '@/lib/player/track'
import { cn } from '@/utilities/ui'

import { PlayIcon } from './parts'
import { usePlayer } from './PlayerProvider'

/**
 * The play button for a piece of on-demand audio: on a card, a story, a show, the home page. It has no audio element of its own. It
 * hands the track to the site's one player (the bar at the bottom of the page), which keeps playing as the reader moves around, and
 * it shows that player's state: "Pause" while this audio is the one playing. Pressing it on audio that is already loaded pauses or
 * resumes it; pressing it on other audio replaces what the player holds.
 *
 * Without script there is no player to hand it to, so a plain browser audio control is there instead (`<noscript>`), and the same
 * control stands in on a page with no provider (never the case inside the site's layout).
 */
export const PlayAudioButton: React.FC<{ track: Track; className?: string }> = ({ track, className }) => {
  const player = usePlayer()
  const fallback = <audio aria-label={`Listen: ${track.title}`} className="w-full" controls preload="none" src={track.src} />
  if (!player) return fallback

  const mine = player.mode === 'track' && player.track?.id === track.id
  const playing = mine && (player.status === 'playing' || player.status === 'loading')
  const length = formatDuration(track.durationSeconds)

  return (
    <>
      <button
        aria-label={`${playing ? 'Pause' : 'Listen'}: ${track.title}`}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-pill px-4 text-sm font-bold text-surface',
          playing ? 'bg-ink hover:bg-ink-2' : 'bg-wuwf-blue-700 hover:bg-wuwf-blue-600',
          className,
        )}
        onClick={() => player.toggleTrack(track)}
        type="button"
      >
        <PlayIcon playing={playing} size={14} />
        <span aria-hidden="true">
          {playing ? 'Pause' : mine ? 'Resume' : 'Listen'}
          {length && <span className="font-normal"> · {length}</span>}
        </span>
      </button>
      <noscript>{fallback}</noscript>
    </>
  )
}
