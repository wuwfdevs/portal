import Link from 'next/link'
import React from 'react'

import { formatLongDate } from '@/lib/format'
import { relationId } from '@/lib/section-data/shape'

import { SectionBand } from '../SectionBand'
import { SectionLink } from '../parts'
import { storyScopeOf } from '../slots'
import type { SectionContext, SectionData, SectionProps } from '../types'
import { HEADLINES_COUNT, HEADLINES_SECTIONS } from './config'

export interface SectionHeadlinesData extends SectionData {
  sections?: unknown
  count?: number | null
}

export interface HeadlineColumn {
  section: { id: string | number; title: string; slug: string }
  stories: ReadonlyArray<{ id: string | number; title: string; path?: string | null; publishedAt?: string | null }>
}

/** A stored count held to the block's range, and the standard one when it is not a number. */
export const headlinesCount = (stored: number | null | undefined): number =>
  typeof stored === 'number' && Number.isFinite(stored) ? Math.min(HEADLINES_COUNT.max, Math.max(HEADLINES_COUNT.min, Math.round(stored))) : HEADLINES_COUNT.standard

/** The section ids in the editor's order: a bare id or a loaded record, a missing one left out, a repeat once, no more than the block holds. */
export function headlineSectionIds(stored: unknown): (string | number)[] {
  const ids = (Array.isArray(stored) ? stored : []).map(relationId).filter((v): v is string | number => v !== null)
  return [...new Map(ids.map((id) => [String(id), id])).values()].slice(0, HEADLINES_SECTIONS.max)
}

/** The key one column claims its stories under in the page's ordered pass (`RenderSections`): the block's own, then the section. */
export const columnKey = (blockId: string, sectionId: string | number): string => `${blockId}:${sectionId}`

/** Whole Tailwind class names for the columns on a wide screen: as many as there are columns. */
const COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3'] as const

/** What the page's ordered pass asks of this block: one request per section, in order, each the newest of its section and how many a column takes. */
export async function sectionHeadlinesClaim(block: SectionHeadlinesData, context?: SectionContext) {
  const ids = headlineSectionIds(block.sections)
  if (ids.length === 0) return null
  const { newestInSection } = await import('@/lib/home-blocks/load')
  const take = headlinesCount(block.count)
  return Promise.all(ids.map(async (id) => ({ part: String(id), candidates: (await newestInSection(id, take, storyScopeOf(context))).map((s) => s.id), take })))
}

/**
 * The columns. A pure view, tested with fixtures: a column with no story left is left out, and with no column left the block draws nothing. Each column's title is the
 * section's name as a link to its page; the band's "more" link (all stories) sits in the heading's row, as every section's does.
 */
export function SectionHeadlinesView({ block, columns }: { block: SectionHeadlinesData; columns: readonly HeadlineColumn[] }) {
  const shown = columns.filter((c) => c.stories.length > 0)
  if (shown.length === 0) return null
  const heading = { ...block.heading, title: block.heading?.title?.trim() || 'More by section' }
  return (
    <SectionBand block={{ ...block, heading }} heading={heading} more={<SectionLink href="/latest" label="All stories" />}>
      <div className={`grid gap-x-10 gap-y-10 ${COLUMNS[shown.length]}`}>
        {shown.map(({ section, stories }) => (
          <section aria-labelledby={`headlines-${block.id ?? 'x'}-${section.id}`} key={section.id}>
            <h3 className="border-b-2 border-current pb-1.5 font-serif text-[1.375rem] font-semibold leading-tight [color:var(--tone-text)]" id={`headlines-${block.id ?? 'x'}-${section.id}`}>
              {section.slug ? (
                <Link className="[color:var(--tone-text)] hover:underline" href={`/${section.slug}`}>
                  {section.title}
                </Link>
              ) : (
                section.title
              )}
            </h3>
            <ul className="list-none p-0">
              {stories.map((story) => (
                <li className="relative border-b py-3 [border-color:var(--tone-card-rule)]" key={story.id}>
                  <p className="font-serif text-[1.0625rem] font-semibold leading-snug [color:var(--tone-text)]">
                    {story.path ? (
                      <Link className="[color:var(--tone-text)] after:absolute after:inset-0 hover:underline" href={story.path}>
                        {story.title}
                      </Link>
                    ) : (
                      story.title
                    )}
                  </p>
                  {story.publishedAt && <p className="text-[0.8125rem] [color:var(--tone-muted)]">{formatLongDate(story.publishedAt)}</p>}
                </li>
              ))}
            </ul>
            {/* Each column leads on to its section's page, as the boards draw it. */}
            {section.slug && (
              <Link className="mt-2 inline-flex min-h-11 items-center font-bold underline underline-offset-2 [color:var(--tone-accent)]" href={`/${section.slug}`}>
                More from {section.title} →
              </Link>
            )}
          </section>
        ))}
      </div>
    </SectionBand>
  )
}

/** More by section. Draws nothing without a section, or when no section has a story left to show. */
export async function SectionHeadlinesSection({ block, context }: SectionProps<SectionHeadlinesData>) {
  const ids = headlineSectionIds(block.sections)
  if (ids.length === 0) return null
  const { newestInSection, sectionById } = await import('@/lib/home-blocks/load')
  const take = headlinesCount(block.count)
  const scope = storyScopeOf(context)
  const columns = await Promise.all(
    ids.map(async (id): Promise<HeadlineColumn | null> => {
      const [candidates, section] = await Promise.all([newestInSection(id, take, scope), sectionById(id)])
      if (!section) return null
      // The ordered pass, when the page has one, says which of them this column shows; otherwise the newest.
      const claimed = block.id ? context.claims?.get(columnKey(block.id, id)) : undefined
      const byId = new Map(candidates.map((s) => [String(s.id), s]))
      const stories = claimed ? claimed.map((c) => byId.get(String(c))).filter((s): s is NonNullable<typeof s> => Boolean(s)) : candidates.slice(0, take)
      return { section, stories }
    }),
  )
  return <SectionHeadlinesView block={block} columns={columns.filter((c): c is HeadlineColumn => c !== null)} />
}
