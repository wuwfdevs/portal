import React from 'react'

import type { VideoPlayerBlock as VideoPlayerBlockProps } from '@/payload-types'

import { formatDuration } from '@/lib/format'
import { cn } from '@/utilities/ui'

/**
 * The browser's own video controls, labelled, with nothing loaded until the reader plays it (`preload="metadata"`
 * fetches only the first frame and the length). A keyboard and a screen reader work without any script.
 */
export const VideoPlayerBlock: React.FC<VideoPlayerBlockProps & { className?: string }> = ({ video, title, caption, poster, className }) => {
  const file = video && typeof video === 'object' ? video : null
  if (!file?.url) return null
  const label = title || file.title
  const posterImage = (poster && typeof poster === 'object' ? poster : null) ?? (file.poster && typeof file.poster === 'object' ? file.poster : null)
  const posterUrl = posterImage?.sizes?.large?.url ?? posterImage?.url ?? undefined
  const length = formatDuration(file.durationSeconds)
  return (
    <figure className={cn('not-prose my-8', className)}>
      <video aria-label={label} className="aspect-video w-full rounded-sm bg-ink" controls playsInline poster={posterUrl} preload="metadata">
        <source src={file.url} type={file.mimeType ?? undefined} />
        <a href={file.url}>{label}</a>
      </video>
      {(caption || file.credit || length) && (
        <figcaption className="mt-2 font-sans text-sm text-ink-3">
          {caption}
          {caption && (file.credit || length) ? ' ' : ''}
          {file.credit && <span className="italic">{file.credit}</span>}
          {length && <span className="ml-2">{length}</span>}
        </figcaption>
      )}
    </figure>
  )
}
