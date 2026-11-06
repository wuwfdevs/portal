import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { formatDuration } from '@/lib/format'
import type { ClipPage, ClipView } from '@/lib/video/load'

const LENGTH = (c: ClipView) => formatDuration(c.durationSeconds)

function Thumb({ clip, className }: { clip: ClipView; className: string }) {
  return (
    <span className={`relative block overflow-hidden rounded-sm bg-surface-dark ${className}`}>
      {clip.posterUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- a decorative poster; the link beside it carries the title
        <img alt="" className="absolute inset-0 size-full object-cover" loading="lazy" src={clip.posterUrl} />
      )}
      {LENGTH(clip) && <span className="absolute bottom-2 right-2 rounded-sm bg-surface-dark/80 px-1.5 py-0.5 font-mono text-[11px] text-surface">{LENGTH(clip)}</span>}
    </span>
  )
}

/**
 * Short video (boards 7 and 8): one vertical clip in the browser's own player with captions on, what it is, where it came from, its
 * funder line if its series has one, then what plays next and a row per series. The player is the native one (a keyboard and a screen
 * reader work with no script) and nothing downloads until the reader presses play. On a phone it is the board's vertical viewer.
 * Not here: sharing and saving (no service behind either) and audio description (no recording of it exists yet).
 */
export function ClipHub({ data, independenceHref }: { data: ClipPage; independenceHref: string | null }) {
  const { clip, acknowledgments, queue, next, rows } = data
  const length = LENGTH(clip)
  return (
    <div className="pb-20">
      <section aria-label="Now playing" className="bg-surface-dark text-surface">
        <div className="container flex flex-wrap gap-10 py-8 md:py-10">
          <div className="flex min-w-[17.5rem] flex-[0_1_24rem] flex-col gap-2">
            <video
              aria-label={clip.title}
              className="aspect-[9/16] max-h-[78svh] w-full rounded-sm bg-ink object-contain md:max-h-none"
              controls
              key={clip.slug}
              playsInline
              poster={clip.posterUrl ?? undefined}
              preload="metadata"
            >
              <source src={clip.videoUrl} type={clip.mimeType ?? undefined} />
              <track default kind="captions" label="English" src={clip.captionsHref} srcLang="en" />
              <a href={clip.videoUrl}>{clip.title}</a>
            </video>
            <p className="text-xs text-surface-dark-text">Captions are on by default. Use CC in the player to turn them off.</p>
          </div>

          <div className="flex min-w-0 flex-[999_1_26rem] flex-col gap-4">
            {clip.series && <p className="text-xs font-bold uppercase tracking-widest text-wuwf-lime">{clip.series.title}</p>}
            <h1 className="font-serif text-3xl font-bold leading-tight md:text-5xl">{clip.title}</h1>
            {clip.description && <p className="max-w-[38rem] text-lg text-surface-dark-text">{clip.description}</p>}
            {(clip.by || length) && <p className="text-base text-surface-dark-text">{[clip.by, length].filter(Boolean).join(' · ')}</p>}
            <div className="flex flex-wrap items-center gap-3">
              {clip.story && (
                <Link className="inline-flex min-h-[3.25rem] items-center rounded-sm bg-surface px-6 text-base font-bold text-surface-dark hover:bg-wuwf-lime hover:no-underline" href={clip.story.href}>
                  {clip.story.label}
                </Link>
              )}
              {next && (
                <Link className="inline-flex min-h-[3.25rem] items-center rounded-sm bg-wuwf-lime px-6 text-base font-bold text-surface-dark hover:bg-surface hover:no-underline md:hidden" href={`/video/${next.slug}`}>
                  Next video
                </Link>
              )}
            </div>
            {acknowledgments.length > 0 && (
              <div className="max-w-[38rem] text-surface-dark-text">
                <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} />
              </div>
            )}

            {queue.length > 0 && (
              <div className="mt-4 flex flex-col gap-2">
                <h2 className="text-xs font-bold uppercase tracking-widest text-surface-dark-text">Up next</h2>
                <ul className="flex flex-col gap-2">
                  {queue.map((q) => (
                    <li key={q.slug}>
                      <Link className="flex min-h-11 items-center gap-4 rounded-sm border border-surface-dark-line p-2.5 text-surface hover:border-wuwf-lime hover:no-underline" href={`/video/${q.slug}`}>
                        <Thumb className="h-24 w-[3.4rem] shrink-0" clip={q} />
                        <span className="flex flex-col gap-0.5">
                          {q.series && <span className="text-[11px] font-bold uppercase tracking-wider text-wuwf-lime">{q.series.title}</span>}
                          <span className="text-base font-bold leading-snug">{q.title}</span>
                          {LENGTH(q) && <span className="text-sm text-surface-dark-text">{LENGTH(q)}</span>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Browse videos" className="container mt-12 flex flex-col gap-10">
        {rows.map((row) => (
          <div className="flex flex-col gap-3.5" key={row.key}>
            <h2 className="font-serif text-2xl font-bold text-ink md:text-3xl">{row.name}</h2>
            <ul className="flex gap-3.5 overflow-x-auto pb-1.5">
              {row.items.map((v) => (
                <li className="w-[11.25rem] shrink-0" key={v.slug}>
                  <Link className="flex flex-col gap-2 text-ink hover:no-underline" href={`/video/${v.slug}`}>
                    <Thumb className="aspect-[9/16] w-full" clip={v} />
                    <span className="text-base font-bold leading-snug">{v.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  )
}
