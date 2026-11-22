import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Button, Eyebrow, NumberBadge, SectionChip, SectionHeading } from '@/components/Kit'
import { PlayAudioButton } from '@/components/ListenLive/PlayAudioButton'
import { Media } from '@/components/Media'
import { formatLongDate } from '@/lib/format'
import { leadHeadlineClass } from '@/lib/homepage/headline'
import { leadPicture } from '@/lib/homepage/select'
import { bylineOf, kickerOf, sectionOf, type HomeStory } from '@/lib/homepage/story'
import { trackFromAudio } from '@/lib/player/track'
import { cn } from '@/utilities/ui'

/**
 * The lead band's first screen: the top unit (when the page has one) and the lead together, as tall as the window leaves below the header, so The Briefing starts just under the
 * fold instead of peeking out above it. On a wide screen only; below it the band stacks and takes the height it needs. The height is the window's (`100svh`) less the header (`--header-h`,
 * set in the page's styles, taller when the header has its second row) and the band's own top padding, never more than 62rem (a very tall window shows the whole Briefing instead). Each
 * `offset` is whole class names so Tailwind generates them, and each names the band's padding it subtracts: `band` the full 3.5rem, `bandTight` the 1.5rem a band takes when a top
 * unit sits right under the header (`SectionBand` `tight`). The children are the lead (`lg:flex-1`, so its picture takes the height that is left) and the top unit, ordered by the
 * screen (above the lead on a wide screen, after it on a phone).
 */
const FIT = {
  /** The coded home page: its top padding is 3rem. */
  page: 'lg:min-h-[min(calc(100svh_-_var(--header-h)_-_3rem),62rem)]',
  /** A Front page lead block in its band: the band's top padding is 3.5rem. */
  band: 'lg:min-h-[min(calc(100svh_-_var(--header-h)_-_3.5rem),62rem)]',
  /** A Front page lead block in a tight band (it opens with a top unit): the band's top padding is 1.5rem. */
  bandTight: 'lg:min-h-[min(calc(100svh_-_var(--header-h)_-_1.5rem),62rem)]',
} as const
export function FirstScreen({ offset = 'page', children, className }: { offset?: keyof typeof FIT; children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col', FIT[offset], className)}>{children}</div>
}

/**
 * The lead band: the lead story's words on the left (26rem, 32rem from `xl`) and its picture on the right, the eyebrow and date on one line above the headline and two pill
 * actions under the summary (Listen, when the story has audio, and Read the story). The picture is 16:9 on a phone and a tablet; on a wide screen it fills the height `FirstScreen`
 * leaves (never less than 24rem), so it is not a fixed shape there. On a phone the picture comes first and everything stacks. The words (eyebrow, headline, summary and actions)
 * are one group, centred against the picture on a wide screen. A headline over `LONG_HEADLINE` characters is set a step smaller from `xl` (`leadHeadlineClass`). The coded home page
 * and the Front page block draw it the same way.
 */
/** The lead's summary: its dek, else its description, else nothing. */
export const summaryOf = (lead: Pick<HomeStory, 'dek' | 'meta'>): string | null => lead.dek?.trim() || lead.meta?.description?.trim() || null

export function LeadArticle({ lead, leadKicker, className }: { lead: HomeStory; leadKicker?: string | null; className?: string }) {
  const leadImage = leadPicture<MediaDoc>(lead)
  const kicker = leadKicker ?? kickerOf(lead)
  const credit = leadImage?.credit?.trim() || null
  const section = sectionOf(lead)
  const dateline = [bylineOf(lead), lead.publishedAt ? formatLongDate(lead.publishedAt) : null].filter(Boolean).join(' · ')
  // Only a file the reader may play: a members-only story's audio comes back without its address for the public, so no button shows.
  const track = lead.featuredAudio && typeof lead.featuredAudio === 'object' ? trackFromAudio(lead.featuredAudio, { title: lead.title, href: lead.path ?? null }) : null
  return (
    <article className={cn('relative grid gap-5 lg:grid-cols-[26rem_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[32rem_minmax(0,1fr)]', className)}>
      {leadImage && (
        // 16:9 below a wide screen; on a wide screen it fills the height `FirstScreen` leaves (never less than 24rem), so the band fills the first screen.
        <div className="relative aspect-video overflow-hidden rounded-4 bg-surface-3 shadow-2 lg:col-start-2 lg:row-start-1 lg:aspect-auto lg:min-h-[24rem]">
          <Media imgClassName="absolute inset-0 size-full object-cover" priority resource={leadImage} size="(min-width: 1024px) 58vw, 100vw" />
          {/* The caption on the picture, as the boards draw it: the picture's credit, in the story's section colour. The section's name is the eyebrow, so it is not said twice. */}
          {credit && <SectionChip className="absolute bottom-4 left-4" label={`Photo: ${credit}`} swatch={section?.swatch} />}
        </div>
      )}
      <div className={cn('flex min-w-0 flex-col gap-3.5 lg:col-start-1 lg:row-start-1 lg:justify-center', !leadImage && 'lg:col-span-2')}>
        {(kicker || dateline) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {kicker && <Eyebrow swatch={section?.swatch}>{kicker}</Eyebrow>}
            {dateline && <span className="text-sm text-ink-3">{dateline}</span>}
          </div>
        )}
        <h1 className={cn('font-serif font-semibold leading-[1.1] tracking-tight text-ink', leadHeadlineClass(lead.title))}>
          {lead.path ? (
            <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={lead.path}>
              {lead.title}
            </Link>
          ) : (
            lead.title
          )}
        </h1>
        {/* The story's summary under the headline: its dek (the standfirst the story page opens with), else the description it is shared with. Sans, as the boards draw it. */}
        {summaryOf(lead) && <p className="line-clamp-5 max-w-[44rem] text-lg text-ink-2 md:text-xl">{summaryOf(lead)}</p>}
        {/* The two actions, above the headline's stretched link (`z-10`): the audio plays in the site's player, and the story is one press away. */}
        {(track || lead.path) && (
          <div className="relative z-10 flex flex-wrap items-center gap-2.5 pt-2">
            {track && <PlayAudioButton track={track} />}
            {lead.path && (
              <Button href={lead.path} variant="outline">
                Read the story
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  )
}

/**
 * The Briefing: a row of up to five, as many columns as there are stories (one on a phone, two on a tablet). The heading is the Kit's, with the lime mark; each item is a
 * `NumberBadge` and its words: the story's section as a dot-and-name eyebrow (in the section's colour), its headline and its date. Draws nothing without stories.
 */
export function Briefing({ top, className }: { top: readonly HomeStory[]; className?: string }) {
  if (top.length === 0) return null
  return (
    <aside aria-labelledby="briefing-heading" className={className}>
      <SectionHeading id="briefing-heading" mark="lime" size="md">
        The Briefing
      </SectionHeading>
      <ol className="mt-3 grid gap-x-6 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--briefing-columns),minmax(0,1fr))]" style={{ '--briefing-columns': top.length } as React.CSSProperties}>
        {top.map((story, i) => {
          const section = sectionOf(story)
          return (
            <li className="relative flex items-start gap-3 border-t border-rule py-4" key={story.id}>
              <NumberBadge n={i + 1} swatch={section?.swatch} />
              <div className="flex min-w-0 flex-col gap-1.5">
                {section && <SectionChip label={section.title} swatch={section.swatch} variant="dot" />}
                <h3 className="font-serif text-lg font-semibold leading-snug">
                  {story.path ? (
                    <Link className="text-ink after:absolute after:inset-0 hover:text-wuwf-blue-700 hover:no-underline" href={story.path}>
                      {story.title}
                    </Link>
                  ) : (
                    story.title
                  )}
                </h3>
                {story.publishedAt && <p className="text-xs text-ink-3">{formatLongDate(story.publishedAt)}</p>}
              </div>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
