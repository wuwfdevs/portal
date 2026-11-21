import Link from 'next/link'
import React from 'react'

import { formatDuration } from '@/lib/format'
import type { ClipView } from '@/lib/video/load'

/**
 * A row of short-video posters that scrolls sideways: the home page's short-video row and the video strip on a section page. A poster is a `rounded-4` picture with a lime play disc, its series as a white pill and its length as a dark one (direction C2). Each clip is one link
 * to its own page, where it plays with captions; nothing loads or plays here. Draws nothing without clips.
 */
export function ClipRail({ clips, label, toned = false }: { clips: readonly ClipView[]; label: string; /** Colour the words from the band's tone (`--tone-*`), as a section block does, instead of the page's fixed ink. */ toned?: boolean }) {
  if (clips.length === 0) return null
  return (
    <ul aria-label={label} className="flex snap-x gap-4 overflow-x-auto pb-2">
      {clips.map((clip) => {
        const time = formatDuration(clip.durationSeconds)
        return (
          <li className="relative flex w-36 shrink-0 snap-start flex-col gap-2 sm:w-52" key={clip.id}>
            <span className="relative block aspect-[9/16] overflow-hidden rounded-4 bg-surface-dark">
              {clip.posterUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- a decorative poster; the link below carries the title
                <img alt="" className="absolute inset-0 size-full object-cover" loading="lazy" src={clip.posterUrl} />
              )}
              {clip.series && <span className="absolute left-2 top-2 max-w-[85%] truncate rounded-pill bg-surface/90 px-2.5 py-0.5 text-[0.6875rem] font-bold uppercase tracking-[0.05em] text-ink-2">{clip.series.title}</span>}
              <span aria-hidden="true" className="absolute bottom-2.5 left-2.5 flex size-10 items-center justify-center rounded-pill bg-wuwf-lime">
                <svg className="text-surface-dark" fill="currentColor" height="14" viewBox="0 0 24 24" width="14">
                  <path d="M7 4l14 8-14 8z" />
                </svg>
              </span>
              {time && <span className="absolute bottom-2.5 right-2.5 rounded-pill bg-surface-dark/80 px-2 py-0.5 font-mono text-[0.6875rem] text-surface">{time}</span>}
            </span>
            <Link className={toned ? 'text-base font-bold leading-snug after:absolute after:inset-0 hover:underline' : 'text-base font-bold leading-snug text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline'} href={`/video/${clip.slug}`}>
              {clip.title}
            </Link>
            {clip.by && <span className={toned ? 'text-sm [color:var(--tone-muted)]' : 'text-sm text-ink-3'}>{clip.by}</span>}
          </li>
        )
      })}
    </ul>
  )
}
