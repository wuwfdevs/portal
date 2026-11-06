import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Media } from '@/components/Media'
import { ShowFrame } from '@/components/RadioLive/parts'
import { formatDuration, formatLongDate } from '@/lib/format'
import type { HomepageSlots, PodcastCard } from '@/lib/homepage/load-slots'
import { leadPicture } from '@/lib/homepage/select'
import { dateParts, joinNames, performanceTitle } from '@/lib/radiolive/arrange'
import { audioOf, type Episode } from '@/lib/shows/load'

// The home page's feature slots (boards 1 and 2), below the news. Each takes a slot that the loader has already decided is worth showing.
// Left out on purpose, because nothing stands behind them yet: "Follow the show", "Get tickets alert" and the persistent player. Audio
// plays in the browser's own controls, and nothing downloads before the reader presses play.

const length = (e: Episode): string | null => formatDuration(audioOf(e)?.durationSeconds) || null

/** The section heading the boards use: a small blue label, a serif heading, and a link to everything on the right. */
function SlotHeading({ id, kicker, title, href, linkLabel }: { id: string; kicker: string; title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{kicker}</p>
        <h2 className="mt-1 font-serif text-3xl font-bold leading-tight text-ink" id={id}>
          {title}
        </h2>
      </div>
      <Link className="inline-flex min-h-11 items-center text-base font-bold text-wuwf-blue-700 underline" href={href}>
        {linkLabel}
      </Link>
    </div>
  )
}

/** "Watch in a minute": the newest short videos, a row that scrolls sideways. Each opens the clip's own page, where it plays with captions. */
export function VideoRow({ slot }: { slot: NonNullable<HomepageSlots['video']> }) {
  return (
    <section aria-labelledby="video-heading" className="container mt-16">
      <SlotHeading href="/video" id="video-heading" kicker="Watch in a minute" linkLabel="All videos" title="Short videos from the region" />
      <ul className="mt-5 flex snap-x gap-4 overflow-x-auto pb-2">
        {slot.clips.map((clip) => {
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
                  <svg fill="currentColor" height="14" viewBox="0 0 24 24" width="14" className="text-surface-dark">
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
    </section>
  )
}

function Cover({ card, className, label }: { card: PodcastCard; className: string; label?: boolean }) {
  return (
    <span className={`relative flex shrink-0 flex-col justify-end overflow-hidden rounded-sm bg-wuwf-teal p-3 ${className}`}>
      {card.heroImage ? (
        <Media imgClassName="absolute inset-0 size-full object-cover" resource={card.heroImage} size="200px" />
      ) : (
        label && <span className="font-serif text-2xl font-bold leading-none text-surface">{card.show.title}</span>
      )}
    </span>
  )
}

/** "Podcasts made in Pensacola": one show with its newest episode to play here, and more shows beside it. */
export function PodcastsSlot({ slot, independenceHref }: { slot: NonNullable<HomepageSlots['podcasts']>; independenceHref: string | null }) {
  const { featured, acknowledgments, others } = slot
  const ep = featured.latest
  const audio = audioOf(ep)
  return (
    <section aria-labelledby="podcasts-heading" className="mt-16 border-y border-rule bg-surface-2 py-12">
      <div className="container flex flex-col gap-6">
        <SlotHeading href="/podcasts" id="podcasts-heading" kicker="WUWF originals" linkLabel="All podcasts" title="Podcasts made in Pensacola" />
        <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <article className="flex flex-col gap-6 rounded-md border border-rule bg-surface p-6 sm:flex-row">
            {featured.show.path ? (
              <Link aria-label={featured.show.title} className="block self-start" href={featured.show.path}>
                <Cover card={featured} className="size-40 sm:size-48" label />
              </Link>
            ) : (
              <Cover card={featured} className="size-40 sm:size-48" label />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-wuwf-teal">
                New episode{featured.show.path ? ' · ' : ''}
                {featured.show.path && (
                  <Link className="text-wuwf-teal underline" href={featured.show.path}>
                    {featured.show.title}
                  </Link>
                )}
              </p>
              <h3 className="font-serif text-2xl font-bold leading-snug">
                {ep.path ? (
                  <Link className="text-ink hover:text-wuwf-blue-700" href={ep.path}>
                    {ep.title}
                  </Link>
                ) : (
                  ep.title
                )}
              </h3>
              {ep.meta?.description && <p className="text-base text-ink-2">{ep.meta.description}</p>}
              <p className="text-sm text-ink-3">{[ep.publishedAt ? formatLongDate(ep.publishedAt) : null, length(ep)].filter(Boolean).join(' · ')}</p>
              {audio?.url && <audio aria-label={`Play: ${ep.title}`} className="w-full" controls preload="none" src={audio.url} />}
              <Acknowledgment headingId="podcast-support-heading" independenceHref={independenceHref} lines={acknowledgments} subject="program" />
            </div>
          </article>
          {others.length > 0 && (
            <ul aria-label="More podcasts" className="flex flex-col gap-3">
              {others.map((card) => (
                <li className="relative flex items-center gap-4 rounded-sm border border-rule bg-surface p-3 hover:shadow-2" key={card.show.id}>
                  <Cover card={card} className="size-16" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {card.show.path ? (
                      <Link className="text-base font-bold leading-snug text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={card.show.path}>
                        {card.show.title}
                      </Link>
                    ) : (
                      <strong className="text-base leading-snug text-ink">{card.show.title}</strong>
                    )}
                    <span className="text-sm text-ink-3">
                      {card.episodes} {card.episodes === 1 ? 'episode' : 'episodes'}
                      {card.latest?.publishedAt ? ` · latest ${formatLongDate(card.latest.publishedAt)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

/** Unearthing Florida: one episode, playable here, and the way into the hub. */
export function UnearthingPanel({ slot }: { slot: NonNullable<HomepageSlots['unearthing']> }) {
  const { production, episode } = slot
  const picture = leadPicture<MediaDoc>(episode) ?? slot.heroImage
  const audio = audioOf(episode)
  return (
    <section aria-labelledby="unearthing-heading" className="flex min-w-0 flex-col gap-4 rounded-md bg-warning-bg p-6 md:p-8">
      <h2 className="font-serif text-2xl font-bold italic text-warning-fg" id="unearthing-heading">
        <Link className="text-warning-fg hover:underline" href="/unearthing-florida">
          {production.title}
        </Link>
      </h2>
      {picture && (
        <div className="relative aspect-[16/7] overflow-hidden rounded-sm bg-surface-3">
          <Media imgClassName="absolute inset-0 size-full object-cover" resource={picture} size="(min-width: 1024px) 600px, 100vw" />
        </div>
      )}
      <h3 className="font-serif text-2xl font-bold leading-snug md:text-3xl">
        {episode.path ? (
          <Link className="text-ink hover:text-warning-fg" href={episode.path}>
            {episode.title}
          </Link>
        ) : (
          episode.title
        )}
      </h3>
      {episode.meta?.description && <p className="text-base text-ink-2">{episode.meta.description}</p>}
      {audio?.url && (
        <div className="flex flex-col gap-1">
          <audio aria-label={`Play: ${episode.title}`} className="w-full" controls preload="none" src={audio.url} />
          {length(episode) && <span className="text-sm text-ink-3">{length(episode)}</span>}
        </div>
      )}
      <Link className="inline-flex min-h-11 items-center self-start text-base font-bold text-warning-fg underline" href="/unearthing-florida">
        Explore the map of sites
      </Link>
    </section>
  )
}

/**
 * RadioLive: the newest recorded set (a link to the show page, where it plays) and the next show with its tickets. No funder line here:
 * as on the show pages, only the RadioLive page carries the production's running funders, so a night is never credited to a sponsor who
 * did not fund it.
 */
export function RadioLivePanel({ slot }: { slot: NonNullable<HomepageSlots['radioLive']> }) {
  const { next, latest, tagline } = slot
  const lead = latest ?? next
  return (
    <section aria-labelledby="radiolive-heading" className="flex min-w-0 flex-col gap-4 rounded-md bg-surface-dark p-6 text-surface md:p-8">
      <h2 className="flex flex-wrap items-baseline gap-3" id="radiolive-heading">
        <Link className="font-serif text-2xl font-bold text-surface hover:underline" href="/radiolive">
          RadioLive
        </Link>
        {tagline && <span className="text-xs font-bold uppercase tracking-widest text-wuwf-lime">{tagline}</span>}
      </h2>
      {lead && (
        <Link aria-label={`${latest ? 'Watch the set' : 'About the show'}: ${performanceTitle(lead)}`} className="block" href={`/radiolive/${lead.slug}`}>
          <ShowFrame className="aspect-[16/7] w-full" show={lead} />
        </Link>
      )}
      {latest && (
        <div className="flex flex-col gap-1">
          <p className="text-xs font-bold uppercase tracking-widest text-surface-dark-text">Latest recorded set{latest.venue ? ` · ${latest.venue}` : ''}</p>
          <h3 className="font-serif text-2xl font-bold leading-snug md:text-3xl">
            <Link className="text-surface hover:underline" href={`/radiolive/${latest.slug}`}>
              {performanceTitle(latest)}
            </Link>
          </h3>
        </div>
      )}
      {next && (
        <div className={`flex flex-wrap items-center gap-x-5 gap-y-3 ${latest ? 'border-t border-surface-dark-line pt-4' : ''}`}>
          <p className="text-base">
            <strong>Next: {dateParts(next.startsAt).long}</strong>
            {next.lineup.length > 0 && ` · ${joinNames(next.lineup.map((a) => a.name))}`}
            {next.venue && !latest && ` · ${next.venue}`}
          </p>
          {next.tickets.href ? (
            <a className="inline-flex min-h-11 items-center rounded-sm bg-wuwf-lime px-4 text-base font-bold text-surface-dark hover:no-underline" href={next.tickets.href} rel="noopener noreferrer">
              {next.tickets.label}
            </a>
          ) : (
            <>
              <span className="rounded-sm border border-surface-dark-line px-3 py-2 text-sm font-bold">{next.tickets.label}</span>
              <Link className="inline-flex min-h-11 items-center text-base font-bold text-surface underline" href={`/radiolive/${next.slug}`}>
                About the show
              </Link>
            </>
          )}
        </div>
      )}
    </section>
  )
}
