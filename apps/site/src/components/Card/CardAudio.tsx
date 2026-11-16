'use client'

import React from 'react'

/**
 * The play control on a story card that has audio: the browser's own controls, labelled with the story's title, so it works
 * with a keyboard and a screen reader. Nothing loads until the listener presses play (`preload="none"`), so a page of cards
 * costs no audio bandwidth, and nothing ever starts by itself.
 *
 * It sits above the card's stretched link (`relative z-10`), so pressing it plays rather than opens the story. Starting one card
 * pauses any other card or story player on the page; two stories talking at once is never wanted. (The live stream's player is
 * its own element and is left alone: pausing the station is the listener's choice.)
 */
export const CardAudio: React.FC<{ src: string; title: string; durationLabel?: string | null }> = ({ src, title, durationLabel }) => (
  <div className="relative z-10 flex flex-col gap-1 pt-1">
    <audio
      aria-label={`Listen: ${title}`}
      className="w-full"
      controls
      onPlay={(event) => {
        for (const other of document.querySelectorAll<HTMLAudioElement>('audio[data-story-audio]')) {
          if (other !== event.currentTarget && !other.paused) other.pause()
        }
      }}
      preload="none"
      src={src}
      data-story-audio=""
    />
    {durationLabel && <span className="text-xs text-ink-3">{durationLabel}</span>}
  </div>
)
