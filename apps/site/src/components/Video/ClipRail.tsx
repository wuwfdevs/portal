import Link from 'next/link'
import React from 'react'

import { formatDuration } from '@/lib/format'
import type { ClipView } from '@/lib/video/load'

/**
 * A row of short-video posters that scrolls sideways: the home page's short-video row and the video strip on a section page. Each clip is one link
 * to its own page, where it plays with captions; nothing loads or plays here. Draws nothing without clips.
 */
export function ClipRail({ clips, label }: { clips: readonly ClipView[]; label: string }) {
  if (clips.length === 0) return null
  return (
    <ul aria-label={label} className="flex snap-x gap-4 overflow-x-auto pb-2">
      {clips.map((clip) => {
        const time = formatDuration(clip.durationSeconds)
        return (
          <li className="relative flex w-36 shrink-0 snap-start flex-col gap-2 sm:w-52" key={clip.id}>
            <span className="relative block aspect-[9/16] overflow-hidden rounded-sm bg-surface-dark">
              {clip.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a decorative poster; the link below carries the title
                <img alt="" className="absolute inset-0 size-full object-cover" loading="lazy" src={clip.posterUrl} />
              )}
              {clip.series && <span className="absolute left-2 top-2 max-w-[85%] truncate rounded-full bg-surface-dark/80 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-surface">{clip.series.title}</span>}
              <span aria-hidden="true" className="absolute bottom-2 left-2 flex size-10 items-center justify-center rounded-full bg-surface/90">
                <svg className="text-surface-dark" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
                  <path d="M7 4l14 8-14 8z" />
                </svg>
              </span>
              {time && <span className="absolute bottom-2 right-2 rounded-sm bg-surface-dark/80 px-1.5 py-0.5 font-mono text-[11px] text-surface">{time}</span>}
            </span>
            <Link className="text-base font-bold leading-snug text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={`/video/${clip.slug}`}>
              {clip.title}
            </Link>
            {clip.by && <span className="text-sm text-ink-3">{clip.by}</span>}
          </li>
        )
      })}
    </ul>
  )
}
