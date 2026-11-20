import { LivePreviewInIframe } from '@/components/LivePreviewListener/InIframe'
import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Banner } from '@/components/Banner'
import { Chip, MembershipAppeal } from '@/components/Article/Parts'
import { Media } from '@/components/Media'
import { StoryGrid } from '@/components/StoryGrid'
import { TitledSection } from '@/components/TitledSection'
import { bannerFor } from '@/lib/banner'
import { formatLongDate } from '@/lib/format'
import { bylineOf, kickerOf, type HomepageData } from '@/lib/homepage/load'
import type { HomepageSlots } from '@/lib/homepage/load-slots'
import { newsBand } from '@/lib/homepage/modules'
import { leadPicture } from '@/lib/homepage/select'
import { cn } from '@/utilities/ui'

import { HomeBand, SponsorRow, TopUnit } from '@/components/Placements'
import { topUnitHeldBack } from '@/lib/placements/exclusions'
import { flowHomeRail } from '@/lib/placements/flow'
import type { HomePlacements } from '@/lib/placements/load'
import type { MembershipAppeal as MembershipAppealWords } from '@/lib/shared-text'

import { PodcastsSlot, RadioLivePanel, UnearthingPanel, VideoRow } from './Slots'

/**
 * The home page (boards 1 and 2, first screen board 1g), filled from the Home page global and the newest published work.
 *
 * The site banner (`lib/banner`), when one is switched on for the home page, comes first, above everything. (One set for every page is drawn by the
 * layout instead.) The top is a band built to fit the first screen at any window height: the lead story's words on the left and its picture on the right, a
 * normal 16:9 that never changes shape with the window, the byline level with the picture's bottom edge; under it The Briefing as a row of up to
 * five. Nothing in it is stretched to match anything else, and the headline is at the top, so it is in view in a short window too.
 * Below, in the board's order: the fellowship feature, then one column of short videos and the news (a titled run of stories per section, each
 * linking to its section, ending with a link to every story). The sponsor tiles flow through the page as one list (`lib/placements/flow.ts`): a pair
 * beside each news section tall enough to hold one, then the banner, then every tile that is left in a "More from our sponsors" row, completed by
 * WUWF promotions where its last row is short. Then podcasts, then RadioLive and Unearthing Florida side by side (`./Slots`). Each slot is left out when it is
 * switched off or has nothing to show; a placement with nothing running draws nothing, so no empty box is ever left.
 *
 * Not here, on purpose: a "Listen now" module (the header's Listen live button and the site's player already do that; owner decision 2026-11-18).
 * Not here yet, because what they need is not built: the WUWF Listens question, newsletters and "From NPR". They are left out rather than
 * drawn as controls that do nothing; each arrives with its feature.
 */
export function HomepageView({
  data,
  slots,
  placements,
  appeal = null,
  independenceHref = null,
}: {
  data: HomepageData
  slots: HomepageSlots
  placements: HomePlacements
  appeal?: MembershipAppealWords | null
  independenceHref?: string | null
}) {
  const { banner, lead, leadKicker, top, feature, modules, allStoriesHref } = data
  const flow = flowHomeRail({ tiles: placements.rail, fillers: placements.fillers, sections: modules.length })
  const leadImage = lead ? leadPicture<MediaDoc>(lead) : null
  const empty = !lead
  // The top unit yields to an emergency banner (`lib/placements/exclusions.ts`).
  const homeTop = topUnitHeldBack(banner, 'home') ? null : placements.top
  const band = newsBand({ sectionRuns: modules.length, railTiles: placements.rail.length, hasNews: !empty })

  return (
    <div className="pb-20">
      <LivePreviewInIframe />
      <Banner banner={bannerFor(banner, 'home-page')} />

      {empty ? (
        <>
          {homeTop && (
            <div className="container pt-8">
              <TopUnit tile={homeTop} />
            </div>
          )}
        <section className="container py-24 text-center">
          <h1 className="font-serif text-4xl font-bold text-ink">WUWF Public Media</h1>
          <p className="mt-4 text-lg text-ink-2">No stories have been published yet. They will appear here as soon as they are.</p>
        </section>
        </>
      ) : (
        <section aria-label="Top stories" className="container flex flex-col pt-8 md:pt-12">
          {/* The top unit (`home.top`): directly under the header on a wide screen, so above the lead. On a phone it follows the lead story's headline and picture, so a
              story is always what the first screen shows. One element, ordered by the screen, so it is drawn (and counted) once. */}
          {homeTop && <TopUnit className="order-2 mt-8 md:order-1 md:mb-8 md:mt-0" tile={homeTop} />}
          {/* The lead band: words left (28.75rem), picture right. On a phone the picture comes first and everything stacks. The words are top-aligned with the
              byline pinned to the bottom, level with the bottom of the picture; the picture keeps its 16:9 and never stretches. */}
          <article className="relative order-1 grid gap-5 md:order-2 lg:grid-cols-[28.75rem_minmax(0,1fr)] lg:gap-10">
            {leadImage && (
              <div className="relative aspect-video overflow-hidden rounded-sm bg-surface-3 lg:col-start-2 lg:row-start-1 lg:self-start">
                <Media imgClassName="absolute inset-0 size-full object-cover" priority resource={leadImage} size="(min-width: 1024px) 58vw, 100vw" />
              </div>
            )}
            <div className={cn('flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1', !leadImage && 'lg:col-span-2')}>
              {(leadKicker ?? kickerOf(lead)) && <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{leadKicker ?? kickerOf(lead)}</p>}
              <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight text-ink xl:text-4xl">
                {lead.path ? (
                  <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={lead.path}>
                    {lead.title}
                  </Link>
                ) : (
                  lead.title
                )}
              </h1>
              {lead.meta?.description && <p className="line-clamp-4 max-w-[44rem] font-serif text-lg text-ink-2 md:text-xl">{lead.meta.description}</p>}
              <p className="mt-auto pt-2 text-sm text-ink-3">
                {[bylineOf(lead), lead.publishedAt ? formatLongDate(lead.publishedAt) : null].filter(Boolean).join(' · ')}
              </p>
            </div>
          </article>

          {/* The Briefing: a row of up to five, as many columns as there are stories. One column on a phone, two on a tablet. */}
          {top.length > 0 && (
            <aside aria-labelledby="briefing-heading" className="order-3 mt-8">
              <h2 className="border-b-2 border-ink pb-2 text-xs font-bold uppercase tracking-widest text-ink-3" id="briefing-heading">
                The Briefing
              </h2>
              <ol className="grid sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--briefing-columns),minmax(0,1fr))]" style={{ '--briefing-columns': top.length } as React.CSSProperties}>
                {top.map((story, i) => (
                  <li
                    className="relative flex gap-4 border-b border-rule py-4 sm:pr-5 lg:flex-col lg:gap-2 lg:border-b-0 lg:border-l lg:px-5 lg:py-4 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0"
                    key={story.id}
                  >
                    <span aria-hidden="true" className="w-5 shrink-0 font-serif text-2xl font-bold leading-none text-wuwf-blue-700">
                      {i + 1}
                    </span>
                    <div className="flex flex-col gap-1">
                      <h3 className="font-serif text-lg font-bold leading-snug">
                        {story.path ? (
                          <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={story.path}>
                            {story.title}
                          </Link>
                        ) : (
                          story.title
                        )}
                      </h3>
                      <p className="text-xs text-ink-3">{[kickerOf(story), story.publishedAt ? formatLongDate(story.publishedAt) : null].filter(Boolean).join(' · ')}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </aside>
          )}
        </section>
      )}

      {feature && (
        <section aria-labelledby="feature-heading" className="mt-16 bg-surface-2 py-12">
          <div className="container grid gap-8 md:grid-cols-[1fr_1.2fr] md:items-start">
            <div className="flex flex-col gap-3">
              <div>
                <Chip href={feature.fellowship.slug ? `/fellowships/${feature.fellowship.slug}` : undefined} tone="teal">
                  {feature.fellowship.title} Fellowship
                </Chip>
              </div>
              <h2 className="font-serif text-3xl font-bold leading-tight text-ink" id="feature-heading">
                {feature.story ? feature.story.title : feature.fellowship.title}
              </h2>
              {(feature.story?.meta?.description ?? feature.fellowship.summary) && (
                <p className="text-lg text-ink-2">{feature.story?.meta?.description ?? feature.fellowship.summary}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-4 text-base font-semibold">
                {feature.story?.path && (
                  <Link className="text-wuwf-blue-700 underline" href={feature.story.path}>
                    Read the story
                  </Link>
                )}
                {feature.fellowship.slug && (
                  <Link className="text-wuwf-blue-700 underline" href={`/fellowships/${feature.fellowship.slug}`}>
                    All {feature.fellowship.title} reporting
                  </Link>
                )}
              </div>
            </div>
            <Acknowledgment
              headingId="feature-support-heading"
              hubHref={feature.fellowship.slug ? `/fellowships/${feature.fellowship.slug}` : null}
              independenceHref={independenceHref}
              lines={feature.acknowledgments}
            />
          </div>
        </section>
      )}

      {/* The short videos and the news run the full width, with a row of sponsor tiles above each section (flow.ts): the first just below the videos. */}
      {(slots.video || band.show) && (
        <div className="container mt-16 flex flex-col gap-14">
          {slots.video && <VideoRow className="" slot={slots.video} />}
          {modules.map((module, i) => (
            <React.Fragment key={module.key}>
              {flow.before[i] && <SponsorRow items={flow.before[i]} />}
              <TitledSection href={module.href} id={`news-${module.key}`} more={module.href ? { href: module.href, label: `More from ${module.heading}` } : null} title={module.heading}>
                <StoryGrid spanFirst stories={module.stories} />
              </TitledSection>
            </React.Fragment>
          ))}
          {flow.after.map((row, i) => (
            <SponsorRow items={row} key={`after-${i}`} />
          ))}
          {band.allStoriesLink && (
            <p>
              <Link className="inline-flex min-h-12 items-center justify-center rounded-sm border-2 border-wuwf-blue-700 px-6 text-base font-bold text-wuwf-blue-700 hover:bg-surface-2 hover:no-underline" href={allStoriesHref}>
                All stories
              </Link>
            </p>
          )}
        </div>
      )}

      <HomeBand tile={placements.band} />

      {slots.podcasts && <PodcastsSlot independenceHref={independenceHref} slot={slots.podcasts} />}

      {(slots.unearthing || slots.radioLive) && (
        <div className={cn('container mt-16 grid gap-6', slots.unearthing && slots.radioLive && 'lg:grid-cols-2')}>
          {slots.unearthing && <UnearthingPanel slot={slots.unearthing} />}
          {slots.radioLive && <RadioLivePanel slot={slots.radioLive} />}
        </div>
      )}

      <section className="container mt-16 max-w-[60rem]">
        <MembershipAppeal appeal={appeal} />
      </section>
    </div>
  )
}
