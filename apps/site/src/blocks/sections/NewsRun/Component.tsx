import React from 'react'

import { newsRunCount } from '@/lib/homepage/modules'
import { relationId } from '@/lib/section-data/shape'

import { SectionBand } from '../SectionBand'
import { SectionLink } from '../parts'
import { storyScopeOf } from '../slots'
import type { SectionContext, SectionData, SectionProps } from '../types'

export interface NewsRunData extends SectionData {
  section?: unknown
  count?: number | null
}

const countOf = newsRunCount

/** What the page's ordered pass asks of this block: the newest of its section (more than it takes), and how many it takes. */
export async function newsRunClaim(block: NewsRunData, context?: SectionContext): Promise<{ candidates: (string | number)[]; take: number } | null> {
  const sectionId = relationId(block.section)
  if (sectionId === null) return null
  const { newestInSection } = await import('@/lib/home-blocks/load')
  const count = countOf(block.count)
  return { candidates: (await newestInSection(sectionId, count, storyScopeOf(context))).map((s) => s.id), take: count }
}

/** News run. Draws nothing without a section, or when it has no story left to show. */
export async function NewsRunSection({ block, context }: SectionProps<NewsRunData>) {
  const sectionId = relationId(block.section)
  if (sectionId === null) return null
  const { newestInSection, sectionById } = await import('@/lib/home-blocks/load')
  const count = countOf(block.count)
  const [candidates, section] = await Promise.all([newestInSection(sectionId, count, storyScopeOf(context)), sectionById(sectionId)])
  if (!section) return null
  // The ordered pass, when the page has one, says which of them this run shows; otherwise the newest.
  const claimed = block.id ? context.claims?.get(block.id) : undefined
  const byId = new Map(candidates.map((s) => [String(s.id), s]))
  const shown = claimed ? claimed.map((id) => byId.get(String(id))).filter((s): s is NonNullable<typeof s> => Boolean(s)) : candidates.slice(0, count)
  if (shown.length === 0) return null
  const { StoryGrid } = await import('@/components/StoryGrid')
  const title = block.heading?.title?.trim() || section.title
  const href = section.slug ? `/${section.slug}` : null
  return (
    <SectionBand block={{ ...block, heading: { ...block.heading, title } }} heading={{ ...block.heading, title }} more={<SectionLink href={href} label={href ? `More from ${title}` : null} />}>
      <StoryGrid hideVoyagerBadge={context.setId === 'voyager'} showDate showSection={false} spanFirst stories={shown} variant="editorial" />
    </SectionBand>
  )
}
