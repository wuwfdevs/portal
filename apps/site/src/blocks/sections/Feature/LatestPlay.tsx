import React from 'react'

import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'

/**
 * "Play the latest": a play button for the newest playable episode of the show the page speaks for, handed to the site's one player like every other play button. It follows the show, so
 * a new episode is the one it plays without anyone editing the page. Draws nothing when the show has no episode with audio the public may play, or when the read fails (the page is still drawn).
 */
export async function LatestPlay({ showId, label }: { showId: number | string; label: string }) {
  const { loadLatestTrack } = await import('@/lib/shows/latest')
  const track = await loadLatestTrack(showId).catch((error: unknown) => {
    console.error('The latest episode could not be loaded and its play button is left out.', error)
    return null
  })
  return track ? <PlayAudioButton label={label} toned track={track} /> : null
}
