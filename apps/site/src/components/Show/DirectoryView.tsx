import Link from 'next/link'
import React from 'react'

import { Media } from '@/components/Media'
import { formatDuration, formatLongDate } from '@/lib/format'
import { audioOf, type DirectoryData } from '@/lib/shows/load'

/**
 * The podcast directory (board 9): every listed show, then the newest episodes across them. (The members band, the member feeds
 * and the sponsorship call are left out: they belong to features that are deferred or not built.)
 */
export function DirectoryView({ data }: { data: DirectoryData }) {
  const { shows, latestEpisodes } = data
  return (
    <div className="pb-20">
      <header className="container flex max-w-[52rem] flex-col gap-3 pt-8 md:pt-12">
        <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">WUWF originals</p>
        <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-5xl">Podcasts made in Pensacola</h1>
        <p className="font-serif text-xl text-ink-2">Live music, Florida history and reporting from the Gulf Coast. Free wherever you listen.</p>
      </header>

      <section aria-labelledby="shows-heading" className="container mt-12">
        <h2 className="font-serif text-3xl font-bold text-ink" id="shows-heading">
          All shows
        </h2>
        {shows.length === 0 ? (
          <p className="mt-4 text-base text-ink-3">No shows are listed yet.</p>
        ) : (
          <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {shows.map(({ show, heroImage, episodes, latest }) => (
              <li className="relative flex flex-col overflow-hidden rounded-sm border border-rule bg-surface shadow-1 hover:shadow-2" key={show.id}>
                {heroImage && (
                  <div className="relative aspect-square w-full overflow-hidden bg-surface-3">
                    <Media imgClassName="absolute inset-0 size-full object-cover" resource={heroImage} size="33vw" />
                  </div>
                )}
                <div className="flex flex-col gap-1 p-4">
                  <h3 className="font-serif text-xl font-bold leading-snug">
                    <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={show.path ?? '#'}>
                      {show.title}
                    </Link>
                  </h3>
                  {show.tagline && <p className="text-sm text-ink-3">{show.tagline}</p>}
                  {show.summary && <p className="mt-1 text-base text-ink-2">{show.summary}</p>}
                  <p className="mt-2 text-xs font-semibold text-ink-3">
                    {episodes} {episodes === 1 ? 'episode' : 'episodes'}
                    {latest?.publishedAt ? ` · latest ${formatLongDate(latest.publishedAt)}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {latestEpisodes.length > 0 && (
        <section aria-labelledby="latest-heading" className="container mt-14 max-w-[52rem]">
          <h2 className="font-serif text-3xl font-bold text-ink" id="latest-heading">
            Latest episodes
          </h2>
          <ol className="mt-4 flex flex-col divide-y divide-rule">
            {latestEpisodes.map((e) => (
              <li className="relative flex flex-col gap-1 py-4" key={e.id}>
                <p className="text-sm text-ink-3">{[e.showTitle, e.publishedAt ? formatLongDate(e.publishedAt) : null, formatDuration(audioOf(e)?.durationSeconds) || null].filter(Boolean).join(' · ')}</p>
                <h3 className="font-serif text-xl font-bold leading-snug">
                  {e.path ? (
                    <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={e.path}>
                      {e.title}
                    </Link>
                  ) : (
                    e.title
                  )}
                </h3>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  )
}
