import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Button, Eyebrow } from '@/components/Kit'
import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { Media } from '@/components/Media'
import { ShowFrame } from '@/components/RadioLive/parts'
import { formatDuration, formatLongDate } from '@/lib/format'
import type { HomepageSlots, PodcastCard } from '@/lib/homepage/load-slots'
import { leadPicture } from '@/lib/homepage/select'
import { trackFromAudio } from '@/lib/player/track'
import { dateParts, joinNames, performanceTitle } from '@/lib/radiolive/arrange'
import { audioOf, type Episode } from '@/lib/shows/load'

// The home page's feature slots (boards 1 and 2), below the news. Each takes a slot that the loader has already decided is worth showing.
// Left out on purpose, because nothing stands behind them yet: "Follow the show" and "Get tickets alert". Audio
// plays in the site's one player (the bar at the bottom), and nothing downloads before the reader presses play.

const length = (e: Episode): string | null => formatDuration(audioOf(e)?.durationSeconds) || null

/**
 * The line under a show beside the featured one: what there is to hear (its newest episode's title and date), so the list offers something to play, not a count. A show whose newest
 * episode has no title, or that has none, falls back to how many episodes it has.
 */
export function otherShowLine(card: Pick<PodcastCard, 'episodes' | 'latest'>): string {
  const title = card.latest?.title?.trim()
  const date = card.latest?.publishedAt ? formatLongDate(card.latest.publishedAt) : null
  if (title) return ['Latest: ' + title, date].filter(Boolean).join(' · ')
  return `${card.episodes} ${card.episodes === 1 ? 'episode' : 'episodes'}${date ? ` · latest ${date}` : ''}`
}

function Cover({ card, className, label }: { card: PodcastCard; className: string; label?: boolean }) {
  return (
    <span className={`relative flex shrink-0 flex-col justify-end overflow-hidden rounded-3 bg-wuwf-teal p-3 ${className}`}>
      {card.heroImage ? (
        <Media imgClassName="absolute inset-0 size-full object-cover" resource={card.heroImage} size="200px" />
      ) : (
        label && <span className="font-serif text-2xl font-semibold leading-none text-surface">{card.show.title}</span>
      )}
    </span>
  )
}

/**
 * The podcasts' content: one show with its newest episode to play here (with its funder line), and more shows beside it. The band, heading and container around it are the
 * caller's: the Show spotlight block draws it.
 */
export function PodcastsBody({ slot, independenceHref }: { slot: NonNullable<HomepageSlots['podcasts']>; independenceHref: string | null }) {
  const { featured, acknowledgments, others } = slot
  const ep = featured.latest
  const track = trackFromAudio(audioOf(ep), { title: ep.title, href: ep.path })
  return (
    <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
          <article className="flex flex-col gap-6 rounded-4 bg-surface-2 p-6 sm:flex-row">
            {featured.show.path ? (
              <Link aria-label={featured.show.title} className="block self-start" href={featured.show.path}>
                <Cover card={featured} className="size-40 sm:size-48" label />
              </Link>
            ) : (
              <Cover card={featured} className="size-40 sm:size-48" label />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <Eyebrow swatch="teal">
                New episode{featured.show.path ? ' · ' : ''}
                {featured.show.path && (
                  <Link className="text-wuwf-teal underline" href={featured.show.path}>
                    {featured.show.title}
                  </Link>
                )}
              </Eyebrow>
              <h3 className="font-serif text-2xl font-semibold leading-snug">
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
              {track && <PlayAudioButton className="self-start" track={track} />}
              <Acknowledgment headingId="podcast-support-heading" independenceHref={independenceHref} lines={acknowledgments} subject="program" />
            </div>
          </article>
          {others.length > 0 && (
            <ul aria-label="More podcasts" className="flex flex-col gap-3">
              {others.map((card) => (
                <li className="relative flex items-center gap-4 rounded-4 bg-surface-2 p-3 hover:shadow-2" key={card.show.id}>
                  <Cover card={card} className="size-[4.5rem]" />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    {card.show.path ? (
                      <Link className="text-base font-bold leading-snug text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={card.show.path}>
                        {card.show.title}
                      </Link>
                    ) : (
                      <strong className="text-base leading-snug text-ink">{card.show.title}</strong>
                    )}
                    <span className="line-clamp-2 text-sm text-ink-3">{otherShowLine(card)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
  )
}

/** Unearthing Florida: one episode, playable here, and the way into the hub. */
export function UnearthingPanel({ slot }: { slot: NonNullable<HomepageSlots['unearthing']> }) {
  const { production, episode } = slot
  const picture = leadPicture<MediaDoc>(episode) ?? slot.heroImage
  const track = trackFromAudio(audioOf(episode), { title: episode.title, href: episode.path })
  return (
    <section aria-labelledby="unearthing-heading" className="flex min-w-0 flex-col gap-4 rounded-4 bg-warning-bg p-6 md:p-8">
      <h2 className="font-serif text-2xl font-bold italic text-warning-fg" id="unearthing-heading">
        <Link className="text-warning-fg hover:underline" href="/shows/unearthing-florida">
          {production.title}
        </Link>
      </h2>
      {picture && (
        <div className="relative aspect-[16/7] overflow-hidden rounded-3 bg-surface-3">
          <Media imgClassName="absolute inset-0 size-full object-cover" resource={picture} size="(min-width: 1024px) 600px, 100vw" />
        </div>
      )}
      <h3 className="font-serif text-2xl font-semibold leading-snug md:text-3xl">
        {episode.path ? (
          <Link className="text-ink hover:text-warning-fg" href={episode.path}>
            {episode.title}
          </Link>
        ) : (
          episode.title
        )}
      </h3>
      {episode.meta?.description && <p className="text-base text-ink-2">{episode.meta.description}</p>}
      {track && <PlayAudioButton className="self-start" track={track} />}
      <Link className="inline-flex min-h-11 items-center self-start text-base font-bold text-warning-fg underline" href="/shows/unearthing-florida">
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
    <section aria-labelledby="radiolive-heading" className="flex min-w-0 flex-col gap-4 rounded-4 bg-surface-dark p-6 text-surface md:p-8">
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
          <h3 className="font-serif text-2xl font-semibold leading-snug md:text-3xl">
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
            <Button href={next.tickets.href} variant="onDark">
              {next.tickets.label}
            </Button>
          ) : (
            <>
              <span className="rounded-pill border border-surface-dark-line px-3 py-2 text-sm font-bold">{next.tickets.label}</span>
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
