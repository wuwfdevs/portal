import React from 'react'

import { TopUnit } from '@/components/Placements'

import { SectionBand } from '../SectionBand'
import { topUnitOf } from '../slots'
import type { SectionData, SectionProps } from '../types'

export interface FrontPageData extends SectionData {
  lead?: unknown
  leadKicker?: string | null
  topStories?: unknown
}

/** What the page's ordered pass asks of this block: the lead and the Briefing, in order, taken before any news run. Pinned, because they are the editors' choice or the newest. */
export async function frontPageClaim(block: FrontPageData): Promise<{ candidates: (string | number)[]; take: number; pinned: (string | number)[] }> {
  const { arrangeFront, TOP_COUNT } = await import('@/lib/home-blocks/load')
  const { lead, top } = await arrangeFront(block)
  const ids = [lead, ...top].filter((s): s is NonNullable<typeof s> => Boolean(s)).map((s) => s.id)
  return { candidates: [], take: TOP_COUNT + 1, pinned: ids }
}

/** Front page lead. Draws nothing when no story is published. The stories come from the page's ordered pass when the page has one, else from the same arrangement. */
export async function FrontPageSection({ block, context }: SectionProps<FrontPageData>) {
  const { arrangeFront, storiesByIds } = await import('@/lib/home-blocks/load')
  const claimed = block.id ? context.claims?.get(block.id) : undefined
  const { lead, top } = claimed
    ? await (async () => {
        const [first, ...rest] = await storiesByIds(claimed)
        return { lead: first ?? null, top: rest }
      })()
    : await arrangeFront(block)
  if (!lead) return null
  // Loaded when it draws: the view reads story fields and the block registry is read by the Payload config.
  const { Briefing, FirstScreen, LeadArticle } = await import('@/components/Homepage/FrontPage')
  const topUnit = topUnitOf(context)
  return (
    <SectionBand block={block} tight={Boolean(topUnit)}>
      {/* The first screen (`FirstScreen`): the lead and the page's top unit (`home.top`, when its set has one), together as tall as the window leaves below the header, so The
          Briefing starts just under the fold. The unit is directly under the header on a wide screen, so above the lead; on a phone it is after the lead's headline and picture
          and before The Briefing. One element, ordered by the screen, so it is drawn (and counted) once. With a unit the band's top padding is the tight one (`tight`), and the
          first screen subtracts that smaller padding (`bandTight`). */}
      <FirstScreen offset={topUnit ? 'bandTight' : 'band'}>
        <LeadArticle className="order-1 md:order-2 lg:flex-1" lead={lead} leadKicker={block.leadKicker?.trim() || null} />
        <TopUnit className="order-2 mt-8 md:order-1 md:mb-6 md:mt-0" tile={topUnit} />
      </FirstScreen>
      <Briefing top={top} />
    </SectionBand>
  )
}
