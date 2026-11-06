import Link from 'next/link'
import React from 'react'

import { Media } from '@/components/Media'
import { dateParts, performanceTitle } from '@/lib/radiolive/arrange'
import type { ArtistView, ShowView } from '@/lib/radiolive/load'

/** A RadioLive artist: their picture, a short bio, and the shows they played (newest first). */
export function ArtistPageView({ artist, shows }: { artist: ArtistView; shows: ShowView[] }) {
  return (
    <div className="min-h-[60vh] bg-surface-dark pb-16 text-surface">
      <div className="container flex flex-col gap-8 py-10 md:py-14">
        <nav aria-label="Breadcrumb">
          <Link className="inline-flex min-h-11 items-center text-sm font-bold text-wuwf-lime" href="/radiolive#artists">
            ← RadioLive artists
          </Link>
        </nav>
        <header className="flex flex-wrap gap-8">
          {artist.photo && (
            <div className="relative aspect-[4/5] w-full max-w-[16rem] overflow-hidden rounded-sm border border-surface-dark-line bg-surface-dark-hover">
              <Media imgClassName="absolute inset-0 size-full object-cover" priority resource={artist.photo} size="256px" />
            </div>
          )}
          <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-3">
            <h1 className="font-serif text-4xl font-bold leading-tight md:text-5xl">{artist.name}</h1>
            {artist.bio && <p className="max-w-[40rem] text-lg text-surface-dark-text">{artist.bio}</p>}
            {artist.link && (
              <a className="inline-flex min-h-11 items-center font-bold text-wuwf-lime" href={artist.link} rel="noopener noreferrer">
                {new URL(artist.link).hostname.replace(/^www\./, '')}
              </a>
            )}
          </div>
        </header>
        <section aria-labelledby="shows-heading" className="flex max-w-[52rem] flex-col gap-3">
          <h2 className="font-serif text-2xl font-bold" id="shows-heading">
            RadioLive shows
          </h2>
          <ul>
            {shows.map((s) => (
              <li className="border-b border-surface-dark-line first:border-t" key={s.slug}>
                <Link className="flex min-h-11 flex-wrap items-baseline gap-x-4 py-3 text-surface hover:no-underline" href={`/radiolive/${s.slug}`}>
                  <span className="text-sm text-surface-dark-text">{dateParts(s.startsAt).long}</span>
                  <span className="font-bold">{performanceTitle(s)}</span>
                  {s.recording && <span className="rounded-sm bg-ink px-1.5 py-0.5 text-[11px] font-bold">Watch</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}
