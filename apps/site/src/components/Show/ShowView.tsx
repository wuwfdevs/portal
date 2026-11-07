import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { AuthorBox, Chip } from '@/components/Article/Parts'
import { Media } from '@/components/Media'
import RichText from '@/components/RichText'
import { AudioPlayerBlock } from '@/blocks/AudioPlayer/Component'
import { formatDuration, formatLongDate } from '@/lib/format'
import { audioOf, type ShowData } from '@/lib/shows/load'
import { episodeLabel } from '@/lib/shows/seasons'

/**
 * A show's page (board 10): what it is, who funds it, the newest episode with its player, who hosts it, every episode.
 *
 * Not here yet (their features are not built, or deferred): following the show, leaving a message (listening), the email
 * signup, transcripts, and related reporting.
 */
export function ShowView({ data, independenceHref }: { data: ShowData; independenceHref: string | null }) {
  const { show, hosts, heroImage, line, episodes, totalEpisodes, acknowledgments, others } = data
  const [latest, ...earlier] = episodes
  const latestAudio = latest ? audioOf(latest) : null
  // A syndicated program (Morning Edition) is one WUWF airs: its page is its airtime, a description and a link to its maker.
  // It has no episodes here, no funder and no "more originals".
  const syndicated = show.kind === 'syndicated'

  return (
    <article className="pb-20">
      <header className="container grid gap-8 pt-8 md:grid-cols-[1.2fr_1fr] md:items-center md:pt-12">
        <div className="flex flex-col gap-4">
          {show.tagline && (
            <div>
              <Chip tone="teal">{show.tagline}</Chip>
            </div>
          )}
          <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-6xl">{show.title}</h1>
          {show.summary && <p className="max-w-[40rem] font-serif text-xl text-ink-2">{show.summary}</p>}
          {line && <p className="text-sm font-semibold text-ink-3">{line}</p>}
        </div>
        {heroImage && (
          <div className="overflow-hidden rounded-sm bg-surface-3 md:max-w-sm md:justify-self-end">
            <Media imgClassName="w-full object-cover" priority resource={heroImage} />
          </div>
        )}
      </header>

      {!syndicated && acknowledgments.length > 0 && (
        <section aria-label="Funding" className="container mt-10 max-w-[52rem]">
          <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} />
        </section>
      )}

      {!syndicated && latest && (
        <section aria-labelledby="latest-heading" className="container mt-12 max-w-[52rem]">
          <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700" id="latest-heading">
            Latest episode{latest.publishedAt ? ` · ${formatLongDate(latest.publishedAt)}` : ''}
          </p>
          <h2 className="mt-2 font-serif text-3xl font-bold leading-snug text-ink">{latest.title}</h2>
          {latest.meta?.description && <p className="mt-2 text-lg text-ink-2">{latest.meta.description}</p>}
          {latestAudio && <AudioPlayerBlock audio={latestAudio} id="" title={latest.title} blockType="audioPlayer" className="mt-4" />}
          {latest.path && (
            <p className="mt-2 text-base">
              <Link className="font-semibold text-wuwf-blue-700 underline" href={latest.path}>
                Show notes and more
              </Link>
            </p>
          )}
        </section>
      )}

      {show.description && (
        <section aria-labelledby="about-heading" className="container mt-12 max-w-[52rem]">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-3" id="about-heading">
            {syndicated ? 'About the program' : 'About the show'}
          </h2>
          <RichText data={show.description} enableGutter={false} />
        </section>
      )}

      {syndicated && show.programUrl && (
        <p className="container mt-8 max-w-[52rem] text-base">
          <a className="inline-flex min-h-11 items-center font-semibold text-wuwf-blue-700 underline" href={show.programUrl} rel="noopener" target="_blank">
            More about {show.title}
          </a>
        </p>
      )}

      {hosts.length > 0 && (
        <section aria-labelledby="hosts-heading" className="container mt-12 max-w-[52rem]">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-3" id="hosts-heading">
            {hosts.length === 1 ? 'Your host' : 'Your hosts'}
          </h2>
          <div className="flex flex-col gap-6">
            {hosts.map((h) => (
              <AuthorBox contributor={h} key={h.id} />
            ))}
          </div>
        </section>
      )}

      {!syndicated && (
        <section aria-labelledby="episodes-heading" className="container mt-14 max-w-[52rem]">
          <h2 className="font-serif text-3xl font-bold text-ink" id="episodes-heading">
            All episodes
          </h2>
          {episodes.length === 0 ? (
            <p className="mt-4 text-base text-ink-3">No episodes have been published yet.</p>
          ) : (
            <ol className="mt-4 flex flex-col divide-y divide-rule">
              {[latest, ...earlier].filter((e): e is NonNullable<typeof e> => Boolean(e)).map((e) => {
                const length = formatDuration(audioOf(e)?.durationSeconds)
                return (
                  <li className="relative flex flex-col gap-1 py-4" key={e.id}>
                    <p className="text-sm text-ink-3">{[episodeLabel(e.episodeNumber, e.episodeType), e.publishedAt ? formatLongDate(e.publishedAt) : null, length || null].filter(Boolean).join(' · ')}</p>
                    <h3 className="font-serif text-xl font-bold leading-snug">
                      {e.path ? (
                        <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={e.path}>
                          {e.title}
                        </Link>
                      ) : (
                        e.title
                      )}
                    </h3>
                    {e.meta?.description && <p className="text-base text-ink-2">{e.meta.description}</p>}
                  </li>
                )
              })}
            </ol>
          )}
          {totalEpisodes > episodes.length && <p className="mt-4 text-sm text-ink-3">Showing the {episodes.length} newest of {totalEpisodes} episodes.</p>}
        </section>
      )}

      {!syndicated && others.length > 0 && (
        <section aria-labelledby="more-heading" className="container mt-14 max-w-[52rem]">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-ink-3" id="more-heading">
            More WUWF originals
          </h2>
          <ul className="flex flex-wrap gap-3">
            {others.map((o) => (
              <li key={o.id}>
                <Link className="inline-flex min-h-11 items-center rounded-sm border border-rule-strong px-4 text-base font-semibold text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline" href={o.path!}>
                  {o.title}
                </Link>
              </li>
            ))}
            <li>
              <Link className="inline-flex min-h-11 items-center px-2 text-base font-semibold text-wuwf-blue-700 underline" href="/podcasts">
                All shows
              </Link>
            </li>
          </ul>
        </section>
      )}
    </article>
  )
}
