import Link from 'next/link'
import React from 'react'

import type { Media as MediaDoc } from '@/payload-types'

import { Media } from '@/components/Media'
import { formatLongDate } from '@/lib/format'
import { bylineOf, kickerOf, type HomeStory } from '@/lib/homepage/story'
import { leadPicture } from '@/lib/homepage/select'
import { cn } from '@/utilities/ui'

/**
 * The lead band: the lead story's words on the left (28.75rem) and its picture on the right, a normal 16:9 that never changes shape with the window, the byline pinned to
 * the bottom level with the picture's bottom edge. On a phone the picture comes first and everything stacks. Nothing in it is stretched to match anything else, and the
 * headline is at the top, so it is in view in a short window too. The coded home page and the Front page block draw it the same way.
 */
export function LeadArticle({ lead, leadKicker, className }: { lead: HomeStory; leadKicker?: string | null; className?: string }) {
  const leadImage = leadPicture<MediaDoc>(lead)
  return (
    <article className={cn('relative grid gap-5 lg:grid-cols-[28.75rem_minmax(0,1fr)] lg:gap-10', className)}>
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
        <p className="mt-auto pt-2 text-sm text-ink-3">{[bylineOf(lead), lead.publishedAt ? formatLongDate(lead.publishedAt) : null].filter(Boolean).join(' · ')}</p>
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
