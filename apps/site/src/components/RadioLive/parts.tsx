import Link from 'next/link'
import React from 'react'

import { Media } from '@/components/Media'
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
        {show.recording && <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[11px] font-bold text-surface">CC</span>}
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

/** The recorded set: the browser's own player, captions on by default, nothing loaded before play. */
export function RecordingPlayer({ show }: { show: ShowView }) {
  if (!show.recording) return null
  const length = formatDuration(show.recording.seconds)
  return (
    <figure className="flex flex-col gap-2">
      <video aria-label={performanceTitle(show)} className="aspect-video w-full rounded-sm bg-ink" controls playsInline poster={show.recording.posterUrl ?? undefined} preload="metadata">
        <source src={show.recording.url} type={show.recording.mimeType ?? undefined} />
        <track default kind="captions" label="English" src={show.recording.captionsHref} srcLang="en" />
        <a href={show.recording.url}>{performanceTitle(show)}</a>
      </video>
      <figcaption className="text-sm text-surface-dark-text">Full set with captions{length ? ` · ${length}` : ''}</figcaption>
    </figure>
  )
}
