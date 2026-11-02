import React from 'react'

import type { AudioPlayerBlock as AudioPlayerBlockProps } from '@/payload-types'

import { Media } from '@/components/Media'
import { formatDuration } from '@/lib/format'
import { cn } from '@/utilities/ui'

/**
 * The browser's own audio controls, labelled. (The site's persistent player arrives with Milestone 2; until then
 * this is the one place audio plays, and it works with a keyboard and a screen reader without any script.)
 */
export const AudioPlayerBlock: React.FC<AudioPlayerBlockProps & { className?: string }> = ({
  audio,
  title,
  description,
  thumbnail,
  className,
}) => {
  const file = audio && typeof audio === 'object' ? audio : null
  if (!file?.url) return null
  const heading = title || file.title
  const text = description || file.description
  const length = formatDuration(file.durationSeconds)
  return (
    <figure className={cn('not-prose my-8 flex flex-col gap-3 rounded-sm border border-rule bg-surface-2 p-4 font-sans sm:flex-row', className)}>
      {thumbnail && typeof thumbnail === 'object' && (
        <div className="w-full shrink-0 sm:w-32">
          <Media imgClassName="rounded-sm" resource={thumbnail} />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <figcaption className="text-base font-bold text-ink">
          {heading}
          {length && <span className="ml-2 text-sm font-normal text-ink-3">{length}</span>}
        </figcaption>
        {text && <p className="text-sm text-ink-2">{text}</p>}
        <audio aria-label={heading} className="w-full" controls preload="none" src={file.url} />
        {file.credit && <p className="text-xs text-ink-3">{file.credit}</p>}
      </div>
    </figure>
  )
}
