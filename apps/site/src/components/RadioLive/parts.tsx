import Link from 'next/link'
import React from 'react'

import { ClickToLoad } from '@/components/ClickToLoad'
import { Media } from '@/components/Media'
import { EMBED_REFERRER_POLICY, EMBED_SANDBOX, embedAllow } from '@/lib/embeds'
import { formatDuration } from '@/lib/format'
import { dateParts, performanceTitle } from '@/lib/radiolive/arrange'
import type { ShowView } from '@/lib/radiolive/load'

/** The picture on a show's card, or a plain dark frame when it has none. */
export function ShowFrame({ show, className }: { show: ShowView; className: string }) {
  return (
    <span className={`relative flex items-center justify-center overflow-hidden rounded-sm border border-surface-dark-line bg-surface-dark-hover ${className}`}>
      {show.photo && <Media imgClassName="absolute inset-0 size-full object-cover" resource={show.photo} size="33vw" />}
      <span className="absolute bottom-2.5 left-2.5 flex gap-1.5">
        <span className="rounded-sm bg-ink px-2 py-0.5 text-xs font-bold text-surface">{dateParts(show.startsAt).long}</span>
        {show.recording?.kind === 'file' && <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[11px] font-bold text-surface">CC</span>}
      </span>
      {show.recording && (
        <span aria-hidden="true" className="relative flex size-14 items-center justify-center rounded-full bg-wuwf-blue-600">
          <svg fill="#FFFFFF" height="18" viewBox="0 0 24 24" width="18">
            <path d="M7 4l14 8-14 8z" />
          </svg>
        </span>
      )}
    </span>
  )
}

export const ShowLink = ({ show, children, className }: { show: ShowView; children: React.ReactNode; className?: string }) => (
  <Link className={className} href={`/radiolive/${show.slug}`}>
    {children}
  </Link>
)

/**
 * The recorded set. An uploaded file plays in the browser's own player with captions on by default and nothing loaded before play. A video on
 * YouTube or Vimeo (where RadioLive's sets are) is shown through the site's embed rules: sandboxed, no script of ours. The site can check an
 * uploaded file's captions but not a hosted video's, so only the file says "with captions".
 */
export function RecordingPlayer({ show }: { show: ShowView }) {
  const rec = show.recording
  if (!rec) return null
  const title = performanceTitle(show)
  if (rec.kind === 'embed') {
    const frame = (
      <iframe
        allow={embedAllow('video')}
        allowFullScreen
        className="size-full border-0"
        loading="lazy"
        referrerPolicy={EMBED_REFERRER_POLICY}
        sandbox={EMBED_SANDBOX}
        src={rec.src}
        title={title}
      />
    )
    return (
      <figure className="flex flex-col gap-2">
        <div className="aspect-video w-full overflow-hidden rounded-sm bg-ink">
          {rec.load === 'click' ? (
            <ClickToLoad host={new URL(rec.src).hostname} title={title}>
              {frame}
            </ClickToLoad>
          ) : (
            frame
          )}
        </div>
        <figcaption className="text-sm text-surface-dark-text">Full set, played from {rec.provider === 'vimeo' ? 'Vimeo' : 'YouTube'}</figcaption>
      </figure>
    )
  }
  const length = formatDuration(rec.seconds)
  return (
    <figure className="flex flex-col gap-2">
      <video aria-label={title} className="aspect-video w-full rounded-sm bg-ink" controls playsInline poster={rec.posterUrl ?? undefined} preload="metadata">
        <source src={rec.url} type={rec.mimeType ?? undefined} />
        <track default kind="captions" label="English" src={rec.captionsHref} srcLang="en" />
        <a href={rec.url}>{title}</a>
      </video>
      <figcaption className="text-sm text-surface-dark-text">Full set with captions{length ? ` · ${length}` : ''}</figcaption>
    </figure>
  )
}
