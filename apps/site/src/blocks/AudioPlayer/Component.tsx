import React from 'react'

import type { AudioPlayerBlock as AudioPlayerBlockProps } from '@/payload-types'

import { Media } from '@/components/Media'
import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { formatDuration } from '@/lib/format'
import { trackFromAudio } from '@/lib/player/track'
import { cn } from '@/utilities/ui'

/**
 * A piece of audio on a page: its title, a line about it, and a button that plays it in the site's one player (the bar at the bottom
 * of the page, which keeps playing as the reader moves around). It has no player of its own. Without script a plain browser control
 * stands in. `href` is the page the audio belongs to, so the player can link back to it.
 */
export const AudioPlayerBlock: React.FC<AudioPlayerBlockProps & { className?: string; href?: string | null }> = ({
  audio,
  title,
  description,
  thumbnail,
  className,
  href,
}) => {
  const file = audio && typeof audio === 'object' ? audio : null
  const track = trackFromAudio(file, { title: title || file?.title, href })
  if (!file || !track) return null
  const text = description || file.description
  const length = formatDuration(file.durationSeconds)
  return (
    <figure className={cn('not-prose my-8 flex flex-col gap-3 rounded-sm border border-rule bg-surface-2 p-4 font-sans sm:flex-row', className)}>
      {thumbnail && typeof thumbnail === 'object' && (
        <div className="w-full shrink-0 sm:w-32">
          <Media imgClassName="rounded-sm" resource={thumbnail} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <figcaption className="text-base font-bold text-ink">
          {track.title}
          {length && <span className="ml-2 text-sm font-normal text-ink-3">{length}</span>}
        </figcaption>
        {text && <p className="text-sm text-ink-2">{text}</p>}
        <PlayAudioButton track={track} />
        {file.credit && <p className="text-xs text-ink-3">{file.credit}</p>}
      </div>
    </figure>
  )
}
