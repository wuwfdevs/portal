import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import { formatLongDate } from '@/lib/format'
import { bylineOf, kickerOf, type HomeStory } from '@/lib/homepage/story'
import { leadPicture } from '@/lib/homepage/select'
import { cn } from '@/utilities/ui'

/**
 * The lead band's first screen: the top unit (when the page has one) and the lead together, as tall as the window leaves below the header, so The Briefing starts just under the
 * fold instead of peeking out above it. On a wide screen only; below it the band stacks and takes the height it needs. The height is the window's (`100svh`) less the header (`--header-h`,
 * set in the page's styles, taller when the header has its second row) and the band's own top padding, never more than 62rem (a very tall window shows the whole Briefing instead). Both
 * `offset`s are whole class names so Tailwind generates them. The children are the lead (`lg:flex-1`, so its picture takes the height that is left) and the top unit, ordered by the
 * screen (above the lead on a wide screen, after it on a phone).
 */
const FIT = {
  /** The coded home page: its top padding is 3rem. */
  page: 'lg:min-h-[min(calc(100svh_-_var(--header-h)_-_3rem),62rem)]',
  /** A Front page lead block in its band: the band's top padding is 3.5rem. */
  band: 'lg:min-h-[min(calc(100svh_-_var(--header-h)_-_3.5rem),62rem)]',
} as const
export function FirstScreen({ offset = 'page', children, className }: { offset?: keyof typeof FIT; children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col', FIT[offset], className)}>{children}</div>
}

/**
 * The lead band: the lead story's words on the left (28.75rem) and its picture on the right, a normal 16:9 that never changes shape with the window, the byline pinned to
 * the bottom level with the picture's bottom edge. On a phone the picture comes first and everything stacks. Nothing in it is stretched to match anything else, and the
 * words (kicker, headline, summary and byline) are one group, centred against the picture on a wide screen. The coded home page and the Front page block draw it the same way.
 */
/** The lead's summary: its dek, else its description, else nothing. */
export const summaryOf = (lead: Pick<HomeStory, 'dek' | 'meta'>): string | null => lead.dek?.trim() || lead.meta?.description?.trim() || null

export function LeadArticle({ lead, leadKicker, className }: { lead: HomeStory; leadKicker?: string | null; className?: string }) {
  const leadImage = leadPicture<MediaDoc>(lead)
  return (
    <article className={cn('relative grid gap-5 lg:grid-cols-[28.75rem_minmax(0,1fr)] lg:gap-10', className)}>
      {leadImage && (
        // 16:9 below a wide screen; on a wide screen it fills the height `FirstScreen` leaves (never less than 24rem), so the band fills the first screen.
        <div className="relative aspect-video overflow-hidden rounded-sm bg-surface-3 lg:col-start-2 lg:row-start-1 lg:aspect-auto lg:min-h-[24rem]">
          <Media imgClassName="absolute inset-0 size-full object-cover" priority resource={leadImage} size="(min-width: 1024px) 58vw, 100vw" />
        </div>
      )}
      <div className={cn('flex min-w-0 flex-col gap-3 lg:col-start-1 lg:row-start-1 lg:justify-center', !leadImage && 'lg:col-span-2')}>
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
        {/* The story's summary under the headline: its dek (the standfirst the story page opens with), else the description it is shared with. */}
        {summaryOf(lead) && <p className="line-clamp-5 max-w-[44rem] font-serif text-lg text-ink-2 md:text-xl">{summaryOf(lead)}</p>}
        <p className="pt-2 text-sm text-ink-3">{[bylineOf(lead), lead.publishedAt ? formatLongDate(lead.publishedAt) : null].filter(Boolean).join(' · ')}</p>
      </div>
    </article>
  )
}

/** The Briefing: a row of up to five, as many columns as there are stories. One column on a phone, two on a tablet. Draws nothing without stories. */
export function Briefing({ top, className }: { top: readonly HomeStory[]; className?: string }) {
  if (top.length === 0) return null
  return (
    <aside aria-labelledby="briefing-heading" className={className}>
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
  )
}
