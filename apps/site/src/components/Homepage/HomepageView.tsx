import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Acknowledgment } from '@/components/Acknowledgment'
import { Chip, MembershipAppeal } from '@/components/Article/Parts'
import { Card } from '@/components/Card'
import { Media } from '@/components/Media'
import { formatLongDate } from '@/lib/format'
import { bylineOf, kickerOf, type HomepageData, type HomeStory } from '@/lib/homepage/load'
import { leadPicture } from '@/lib/homepage/select'
import { cn } from '@/utilities/ui'

/** A card's data with the story's lead picture standing in for the SEO image, which migrated stories do not have. */
const asCard = (story: HomeStory) => ({ ...story, meta: { ...story.meta, image: leadPicture<MediaDoc>(story) } })

const Safe: React.FC<{ href: string; className?: string; children: React.ReactNode }> = ({ href, className, children }) =>
  href.startsWith('/') ? (
    <Link className={className} href={href}>
      {children}
    </Link>
  ) : (
    <a className={className} href={href} rel="noopener noreferrer">
      {children}
    </a>
  )

/**
 * The home page (boards 1 and 2), filled from the Home page global and the newest published work.
 *
 * Not here yet, because what they need is not built: the live player and "on now", the WUWF Listens question, podcasts,
 * RadioLive and Unearthing Florida features, short videos, newsletters, "From NPR", and sponsor placements. They are left
 * out rather than drawn as controls that do nothing; each arrives with its feature.
 */
export function HomepageView({ data }: { data: HomepageData }) {
  const { emergency, lead, leadKicker, top, feature, local } = data
  const leadImage = lead ? leadPicture<MediaDoc>(lead) : null
  const empty = !lead

  return (
    <div className="pb-20">
      {emergency && (
        <section aria-label={emergency.label} className="border-b-4 border-wuwf-blue-700 bg-wuwf-blue-100">
          <div className="container flex flex-col gap-2 py-5 md:flex-row md:items-center md:justify-between md:gap-8">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{emergency.label}</p>
              <h2 className="font-serif text-2xl font-bold leading-snug text-ink">{emergency.headline}</h2>
              {emergency.body && <p className="max-w-[44rem] text-base text-ink-2">{emergency.body}</p>}
            </div>
            {emergency.linkHref && (
              <Safe
                className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-sm bg-wuwf-blue-700 px-6 text-base font-bold text-surface hover:bg-wuwf-blue-600 hover:no-underline"
                href={emergency.linkHref}
              >
                {emergency.linkLabel ?? 'Read more'}
              </Safe>
            )}
          </div>
        </section>
      )}

      {empty ? (
        <section className="container py-24 text-center">
          <h1 className="font-serif text-4xl font-bold text-ink">WUWF Public Media</h1>
          <p className="mt-4 text-lg text-ink-2">No stories have been published yet. They will appear here as soon as they are.</p>
        </section>
      ) : (
        <section aria-label="Top stories" className="container grid gap-10 pt-8 md:pt-12 lg:grid-cols-[1.7fr_1fr]">
          <article className="relative flex flex-col gap-4">
            {leadImage && (
              <div className="overflow-hidden rounded-sm bg-surface-3">
                <Media imgClassName="w-full object-cover" priority resource={leadImage} />
              </div>
            )}
            {(leadKicker ?? kickerOf(lead)) && <p className="text-xs font-bold uppercase tracking-widest text-wuwf-blue-700">{leadKicker ?? kickerOf(lead)}</p>}
            <h1 className="font-serif text-3xl font-bold leading-tight tracking-tight text-ink md:text-5xl">
              {lead.path ? (
                <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={lead.path}>
                  {lead.title}
                </Link>
              ) : (
                lead.title
              )}
            </h1>
            {lead.meta?.description && <p className="max-w-[44rem] font-serif text-xl text-ink-2">{lead.meta.description}</p>}
            <p className="text-sm text-ink-3">
              {[bylineOf(lead), lead.publishedAt ? formatLongDate(lead.publishedAt) : null].filter(Boolean).join(' · ')}
            </p>
          </article>

          {top.length > 0 && (
            <aside aria-labelledby="briefing-heading" className="flex flex-col gap-4 lg:border-l lg:border-rule lg:pl-8">
              <h2 className="text-xs font-bold uppercase tracking-widest text-ink-3" id="briefing-heading">
                The Briefing
              </h2>
              <ol className="flex flex-col divide-y divide-rule">
                {top.map((story, i) => (
                  <li className="relative flex gap-4 py-4 first:pt-0" key={story.id}>
                    <span aria-hidden="true" className="font-serif text-2xl font-bold text-wuwf-blue-700">
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
            <Acknowledgment hubHref={feature.fellowship.slug ? `/fellowships/${feature.fellowship.slug}` : null} lines={feature.acknowledgments} />
          </div>
        </section>
      )}

      {local.stories.length > 0 && (
        <section aria-labelledby="local-heading" className="container mt-16">
          <h2 className="font-serif text-3xl font-bold text-ink" id="local-heading">
            {local.heading}
          </h2>
          <ul className={cn('mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3')}>
            {local.stories.map((story) => (
              <li key={story.id}>
                <Card className="h-full" doc={asCard(story)} fixedImage showCategories />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="container mt-16 max-w-[60rem]">
        <MembershipAppeal />
      </section>
    </div>
  )
}
