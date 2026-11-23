'use client'

import React from 'react'

import { formatDuration } from '@/lib/format'
import type { Track } from '@/lib/player/track'
import { buttonClasses } from '@/components/Kit/button'

import { PlayIcon } from './parts'
import { usePlayer } from './PlayerProvider'

/**
 * The play button for a piece of on-demand audio: on a card, a story, a show, the home page. It has no audio element of its own. It
 * hands the track to the site's one player (the bar at the bottom of the page), which keeps playing as the reader moves around, and
 * it shows that player's state: "Pause" while this audio is the one playing. Pressing it on audio that is already loaded pauses or
 * resumes it; pressing it on other audio replaces what the player holds.
 *
 * It is the Kit's button: lime with dark text while idle (the `play` variant, on white or on a tinted panel; a caller on a ground where lime is faint passes its own colours in
 * `className`), ink while this audio is playing (`toned`, in a section band: the band's button, an outline while playing). Every place that plays station audio draws this one, so its look is defined here and nowhere else.
 *
 * Without script there is no player to hand it to, so a plain browser audio control is there instead (`<noscript>`), and the same
 * control stands in on a page with no provider (never the case inside the site's layout).
 */
export const PlayAudioButton: React.FC<{ track: Track; className?: string; /** Inside a section band: take the band's own button colours (`--tone-*`), so the button is right on every tone (lime on a lime band would vanish). */ toned?: boolean; /** The word on the button while it is idle ("Play the latest"); the default is "Listen". It never changes what a screen reader hears: that is always "Listen" and the title. */ label?: string }> = ({ track, className, toned = false, label = 'Listen' }) => {
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
        className={buttonClasses({ variant: toned ? (playing ? 'toneOutline' : 'tone') : playing ? 'primary' : 'play', className })}
        onClick={() => player.toggleTrack(track)}
        type="button"
      >
        <PlayIcon playing={playing} size={14} />
        <span aria-hidden="true">
          {playing ? 'Pause' : mine ? 'Resume' : label}
          {length && <span className="font-normal"> · {length}</span>}
        </span>
      </button>
      <noscript>{fallback}</noscript>
    </>
  )
}
