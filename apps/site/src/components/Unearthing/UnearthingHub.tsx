import Link from 'next/link'
import React from 'react'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Media } from '@/components/Media'
import { leadPicture } from '@/lib/homepage/select'
import type { Media as MediaDoc } from '@/payload-types'
import { AudioPlayerBlock } from '@/blocks/AudioPlayer/Component'
import { formatLongDate } from '@/lib/format'
import { episodeCount } from '@/lib/unearthing/group'
import { periodLabel } from '@/lib/unearthing/periods'
import { audioOf, type UnearthingData } from '@/lib/unearthing/load'

import { ExplorePanel } from './ExplorePanel'

/**
 * The Unearthing Florida hub (board 11): what the series is, the featured episode with its player, the map and timeline, the
 * collections, and the "then & now" pairs. Warm "archive" colors are the board's; they come from the design tokens.
 *
 * Not here yet, on purpose: the place-tip form and the weekly email (neither has a service behind it, and nothing is faked),
 * the episode transcripts (not migrated), and a funder line other than the one the underwriting agreement provides.
 */
export function UnearthingHub({ data, independenceHref }: { data: UnearthingData; independenceHref: string | null }) {
  const { production, dateline, about, acknowledgments, featured, totalEpisodes, sites, periods, collections, thenNow } = data
  const featuredAudio = featured ? audioOf(featured) : null
  const featuredPicture = featured ? leadPicture<MediaDoc>(featured) : null
  const featuredPeriod = featured && 'period' in featured ? periodLabel((featured as { period?: string | null }).period) : ''

  return (
    <article className="bg-warning-bg font-sans text-ink">
      <header className="border-b border-warning-border">
        <div className="container flex flex-wrap items-end gap-8 pb-10 pt-12 md:pt-14">
          <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-3.5">
            <p className="font-mono text-sm text-warning-fg">
              {totalEpisodes > 0 ? episodeCount(totalEpisodes) : 'Episodes coming'}
              {dateline ? ` · ${dateline}` : ''}
            </p>
            <h1 className="font-serif text-6xl font-bold italic leading-[0.92] tracking-tight text-warning-fg md:text-8xl">{production.title}</h1>
            {production.summary && <p className="max-w-[40rem] font-serif text-xl leading-relaxed text-ink-2 md:text-2xl">{production.summary}</p>}
          </div>
          <div className="flex min-w-0 flex-[1_1_20rem] flex-col gap-2.5 rounded-sm border border-warning-border bg-surface/45 p-5">
            {about && (
              <>
                <h2 className="text-xs font-bold uppercase tracking-widest text-warning-fg">About the project</h2>
                <p className="text-[0.95rem] text-ink-2">{about}</p>
              </>
            )}
            <form action="/search" className="flex flex-col gap-2" method="get" role="search">
              <label className="mt-1.5 text-sm font-bold" htmlFor="uf-search">Search every episode</label>
              <div className="flex gap-2">
                <input className="min-h-12 min-w-0 flex-1 rounded-sm border border-warning-border bg-surface px-3 text-base" id="uf-search" name="q" placeholder="A place or a people" type="search" />
                <button className="min-h-12 rounded-sm bg-warning-fg px-4 font-bold text-surface" type="submit">Search</button>
              </div>
            </form>
          </div>
        </div>
      </header>

      {acknowledgments.length > 0 && (
        <section aria-label="Funding" className="container mt-8 max-w-[52rem]">
          <Acknowledgment independenceHref={independenceHref} lines={acknowledgments} />
        </section>
      )}

      {featured ? (
        <section aria-label="Featured episode" className="container flex flex-wrap gap-10 py-12">
          {featuredPicture && (
            <figure className="m-0 min-w-0 flex-[999_1_32rem]">
              <div className="border border-warning-border bg-[#E9D5A8] p-2.5">
                <Media imgClassName="w-full object-cover" priority resource={featuredPicture} />
              </div>
            </figure>
          )}
          <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-3.5">
            <p className="font-mono text-xs text-warning-fg">
              {[featuredPeriod, featured.publishedAt ? formatLongDate(featured.publishedAt) : ''].filter(Boolean).join(' · ') || 'Featured episode'}
            </p>
            <h2 className="font-serif text-4xl font-bold leading-tight">{featured.title}</h2>
            {featured.meta?.description && <p className="font-serif text-lg leading-relaxed text-ink-2">{featured.meta.description}</p>}
            {featuredAudio && <AudioPlayerBlock audio={featuredAudio} blockType="audioPlayer" className="mt-0 bg-surface" id="" title={featured.title} />}
            {featured.path && (
              <p className="text-sm font-bold">
                <Link className="text-warning-fg underline underline-offset-4" href={featured.path}>Read and listen</Link>
              </p>
            )}
          </div>
        </section>
      ) : (
        <section aria-label="Featured episode" className="container py-12">
          <p className="rounded-sm border border-dashed border-warning-border bg-surface/60 p-6 text-ink-2">The first episodes are on their way.</p>
        </section>
      )}

      <section aria-labelledby="explore-heading" className="border-y border-warning-border bg-surface">
        <div className="container flex flex-col gap-7 py-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-warning-fg">Explore</p>
            <h2 className="mt-1 font-serif text-3xl font-bold md:text-4xl" id="explore-heading">Every site, by place and by time</h2>
          </div>
          <ExplorePanel
            periods={periods}
            sites={sites.map((s) => ({ id: s.id, name: s.name, short: s.short, place: s.place, era: s.era, description: s.description, x: s.x, y: s.y, count: s.count, episodes: s.episodes.map((e) => ({ id: e.id, title: e.title, path: e.path })) }))}
          />
        </div>
      </section>

      {collections.length > 0 && (
        <section aria-labelledby="collections-heading" className="container flex flex-col gap-6 py-12" id="series">
          <h2 className="font-serif text-3xl font-bold md:text-4xl" id="collections-heading">Collections</h2>
          <div className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
            {collections.map((c) => (
              <section aria-label={c.title} className="flex flex-col gap-3 rounded-sm border border-warning-border bg-surface p-6" key={c.id}>
                <p className="font-mono text-xs text-warning-fg">Collection · {episodeCount(c.episodes.length)}</p>
                <h3 className="font-serif text-2xl font-bold italic leading-tight">{c.title}</h3>
                <ol className="m-0 list-none p-0">
                  {c.episodes.slice(0, 8).map((e) => (
                    <li className="flex items-baseline justify-between gap-3 border-t border-[#E9D5A8] py-2.5" key={e.id}>
                      {e.path ? <Link className="font-semibold text-ink" href={e.path}>{e.title}</Link> : <span className="font-semibold">{e.title}</span>}
                      {e.publishedAt && <span className="shrink-0 font-mono text-xs text-ink-3">{formatLongDate(e.publishedAt)}</span>}
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </section>
      )}

      {thenNow.pairs.length > 0 && (
        <section aria-label="Then and now" className="bg-surface-dark text-surface">
          <div className="container flex flex-wrap items-center gap-8 py-12">
            <div className="flex min-w-0 flex-[1_1_22rem] flex-col gap-2.5">
              <p className="text-xs font-bold uppercase tracking-widest text-wuwf-lime">Then &amp; now</p>
              {thenNow.heading && <h2 className="font-serif text-3xl font-bold leading-tight">{thenNow.heading}</h2>}
              {thenNow.blurb && <p className="text-surface-dark-text">{thenNow.blurb}</p>}
            </div>
            <div className="flex min-w-0 flex-[999_1_32rem] flex-col gap-4">
              {thenNow.pairs.map((p) => (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(15rem,1fr))]" key={`${p.then.id}-${p.now.id}`}>
                  <PairCard label="Then" story={p.then} tone="then" />
                  <PairCard label="Now" story={p.now} tone="now" />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  )
}

function PairCard({ label, story, tone }: { label: string; story: { title: string; path?: string | null; publishedAt?: string | null }; tone: 'then' | 'now' }) {
  const body = (
    <>
      <span className={`text-xs font-bold uppercase tracking-widest ${tone === 'then' ? 'font-mono text-warning-fg' : 'text-wuwf-teal'}`}>
        {label}
        {story.publishedAt && tone === 'now' ? ` · ${formatLongDate(story.publishedAt)}` : ''}
      </span>
      <strong className="font-serif text-xl leading-snug">{story.title}</strong>
    </>
  )
  const cls = `flex min-h-11 flex-col gap-1.5 rounded-sm p-5 text-ink no-underline ${tone === 'then' ? 'bg-warning-bg' : 'bg-surface'}`
  return story.path ? (
    <Link className={cls} href={story.path}>{body}</Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
