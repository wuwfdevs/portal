import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { AuthorBox, Chip } from '@/components/Article/Parts'
import { Card } from '@/components/Card'
import { Media } from '@/components/Media'
import { formatLongDate } from '@/lib/format'
import type { FellowshipHubData } from '@/lib/fellowship/load'

/**
 * A fellowship's hub page (board 4): what the fellowship is, who funds it, who reports it and everything made through it.
 * Every part reads from the records, so staff change the page by editing the fellowship, its agreements and its stories.
 *
 * Not on this page yet, because the features behind them are not built: following the fellowship, asking it a question and
 * the open questions list (listening), the newsletter signup, "explore by place", and related coverage. They are left out
 * rather than drawn as buttons that do nothing.
 */
export function FellowshipHub({ data, independenceHref }: { data: FellowshipHubData; independenceHref: string | null }) {
  const { fellowship, fellow, heroImage, stats, stories, counts, acknowledgments } = data
  const [latest, ...rest] = stories
  const total = counts.stories + counts.episodes + counts.videos
  const focusAreas = fellowship.focusAreas ?? []

  return (
    <article className="pb-20">
      <header className="container grid gap-8 pt-8 md:grid-cols-[1.1fr_1fr] md:items-center md:pt-12">
        <div className="flex flex-col gap-4">
          {fellowship.eyebrow && (
            <div>
              <Chip tone="teal">{fellowship.eyebrow}</Chip>
            </div>
          )}
          <h1 className="font-serif text-4xl font-bold leading-tight tracking-tight text-ink md:text-6xl">{fellowship.title}</h1>
          {fellowship.summary && <p className="max-w-[40rem] font-serif text-xl text-ink-2">{fellowship.summary}</p>}
          {stats && <p className="text-sm font-semibold text-ink-3">{stats}</p>}
        </div>
        {heroImage && (
          <div className="overflow-hidden rounded-sm bg-surface-3">
            <Media imgClassName="w-full object-cover" priority resource={heroImage} />
          </div>
        )}
      </header>

      {acknowledgments.length > 0 && (
        <section aria-label="Funding" className="container mt-10 max-w-[52rem]">
          <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} />
        </section>
      )}

      {(fellowship.missionHeadline || fellowship.mission || focusAreas.length > 0) && (
        <section aria-labelledby="mission-heading" className="container mt-14 max-w-[52rem]">
          <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3" id="mission-heading">
            The mission
          </h2>
          {fellowship.missionHeadline && <p className="mt-3 font-serif text-3xl font-bold leading-snug text-ink">{fellowship.missionHeadline}</p>}
          {fellowship.mission && <p className="mt-4 text-lg text-ink-2">{fellowship.mission}</p>}
          {focusAreas.length > 0 && (
            <ul className="mt-6 grid gap-4 sm:grid-cols-3">
              {focusAreas.map((area, i) => (
                <li className="rounded-sm border border-rule bg-surface-2 p-4" key={area.id ?? i}>
                  <p className="text-base font-bold text-ink">{area.title}</p>
                  {area.blurb && <p className="mt-1 text-sm text-ink-3">{area.blurb}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {fellow && (
        <section aria-labelledby="fellow-heading" className="container mt-14 max-w-[52rem]">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-widest text-ink-3" id="fellow-heading">
            The fellow
          </h2>
          <AuthorBox contributor={fellow} />
        </section>
      )}

      <section aria-labelledby="work-heading" className="container mt-14">
        <h2 className="font-serif text-3xl font-bold text-ink" id="work-heading">
          {total > 0 ? `All ${fellowship.title} work` : 'Reporting'}
        </h2>
        {latest ? (
          <div className="mt-6 flex flex-col gap-8">
            <div className="max-w-[52rem]">
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">
                Latest{latest.publishedAt ? ` · ${formatLongDate(latest.publishedAt)}` : ''}
              </p>
              <Card className="md:flex-row" doc={latest} showCategories />
            </div>
            {rest.length > 0 && (
              <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((story) => (
                  <li key={story.id}>
                    <Card className="h-full" doc={story} showCategories />
                  </li>
                ))}
              </ul>
            )}
            {total > stories.length && (
              <p className="text-sm text-ink-3">
                Showing the {stories.length} most recent of {total}.
              </p>
            )}
          </div>
        ) : (
          <p className="mt-4 text-base text-ink-3">Nothing has been published through this fellowship yet.</p>
        )}
      </section>

      <section aria-labelledby="integrity-heading" className="container mt-16 max-w-[52rem] border-t border-rule pt-8">
        <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3" id="integrity-heading">
          How the fellowship works
        </h2>
        <dl className="mt-4 grid gap-6 sm:grid-cols-3">
          <div>
            <dt className="text-base font-bold text-ink">Who decides</dt>
            <dd className="mt-1 text-sm text-ink-2">WUWF News chooses topics, assigns and edits every piece. Listener questions inform what we pursue.</dd>
          </div>
          <div>
            <dt className="text-base font-bold text-ink">What funders get</dt>
            <dd className="mt-1 text-sm text-ink-2">Acknowledgment on fellowship work and this page. No review, approval or advance notice of coverage.</dd>
          </div>
          <div>
            <dt className="text-base font-bold text-ink">If we cover a funder</dt>
            <dd className="mt-1 text-sm text-ink-2">We disclose the relationship in the story, every time.</dd>
          </div>
        </dl>
        {independenceHref && (
          <p className="mt-6 text-sm">
            <Link className="font-semibold text-wuwf-blue-700 underline" href={independenceHref}>
              Read our editorial independence policy
            </Link>
          </p>
        )}
      </section>
    </article>
  )
}
