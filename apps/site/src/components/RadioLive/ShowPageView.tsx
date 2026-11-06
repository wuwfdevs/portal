import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Media } from '@/components/Media'
import { dateParts, hasHappened, performanceTitle } from '@/lib/radiolive/arrange'
import type { ArtistView, ShowView } from '@/lib/radiolive/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import { RecordingPlayer } from './parts'

const kicker = 'text-xs font-bold uppercase tracking-widest'

/** One RadioLive show: before it, the lineup and how to get tickets; after it, the recorded set. Same dark look as the RadioLive page. */
export function ShowPageView({ show, acknowledgments, independenceHref }: { show: ShowView; acknowledgments: AcknowledgmentLine[]; independenceHref: string | null }) {
  const d = dateParts(show.startsAt)
  const over = hasHappened(show.startsAt, new Date())
  return (
    <div className="min-h-[60vh] bg-surface-dark pb-16 text-surface">
      <div className="container flex flex-col gap-8 py-10 md:py-14">
        <nav aria-label="Breadcrumb">
          <Link className="inline-flex min-h-11 items-center text-sm font-bold text-wuwf-lime" href="/radiolive">
            ← RadioLive
          </Link>
        </nav>
        <header className="flex max-w-[52rem] flex-col gap-3">
          <p className={`${kicker} text-wuwf-lime`}>
            {d.weekday}, {d.long} · {d.time}
          </p>
          <h1 className="font-serif text-4xl font-bold leading-tight md:text-5xl">{performanceTitle(show)}</h1>
          {show.venue && <p className="text-lg text-surface-dark-text">{show.venue}</p>}
          {show.description && <p className="text-lg text-surface-dark-text">{show.description}</p>}
        </header>

        {show.recording ? (
          <div className="max-w-[56rem]">
            <RecordingPlayer show={show} />
          </div>
        ) : over ? (
          <p className="max-w-[52rem] rounded-sm border border-surface-dark-line px-4 py-3 text-surface-dark-text">This show took place on {d.long}. Its recording is not posted yet.</p>
        ) : (
          <div className="flex max-w-[52rem] flex-col items-start gap-3">
            {show.tickets.href ? (
              <a className="inline-flex min-h-[3.25rem] items-center rounded-sm bg-wuwf-lime px-6 text-base font-bold text-surface-dark hover:bg-surface hover:no-underline" href={show.tickets.href} rel="noopener noreferrer">
                {show.tickets.label}
              </a>
            ) : (
              <p className="rounded-sm border border-surface-dark-line px-4 py-3 font-bold">{show.tickets.label}</p>
            )}
            <p className="text-sm text-surface-dark-text">Tickets are sold through the venue&apos;s ticketing site, not by WUWF. Every show is also on the air on 88.1 FM.</p>
          </div>
        )}

        {show.photo && !show.recording && (
          <div className="relative aspect-[16/9] max-w-[56rem] overflow-hidden rounded-sm bg-surface-dark-hover">
            <Media imgClassName="absolute inset-0 size-full object-cover" resource={show.photo} />
          </div>
        )}

        {show.lineup.length > 0 && (
          <section aria-labelledby="lineup-heading" className="flex flex-col gap-4">
            <h2 className="font-serif text-2xl font-bold" id="lineup-heading">
              The lineup
            </h2>
            <ul className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,9.5rem),1fr))]">
              {show.lineup.map((a: ArtistView) => (
                <li key={a.slug}>
                  <Link className="flex flex-col gap-2 text-surface hover:no-underline" href={`/radiolive/artists/${a.slug}`}>
                    <span className="relative block aspect-[4/5] overflow-hidden rounded-sm border border-surface-dark-line bg-surface-dark-hover">
                      {a.photo && <Media imgClassName="absolute inset-0 size-full object-cover" resource={a.photo} size="20vw" />}
                    </span>
                    <strong className="text-lg leading-snug">{a.name}</strong>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {acknowledgments.length > 0 && (
          <div className="max-w-[40rem] text-ink">
            <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} subject="program" />
          </div>
        )}
      </div>
    </div>
  )
}
