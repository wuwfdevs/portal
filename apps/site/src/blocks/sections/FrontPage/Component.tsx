import React from 'react'

import { TopUnit } from '@/components/Placements'

import { SectionBand } from '../SectionBand'
import { topUnitOf } from '../slots'
import type { SectionContext, SectionData, SectionProps } from '../types'
import { storyScopeOf } from '../slots'

export interface FrontPageData extends SectionData {
  lead?: unknown
  leadKicker?: string | null
  topStories?: unknown
}

/** What the page's ordered pass asks of this block: the lead and the Briefing, in order, taken before any news run. Pinned, because they are the editors' choice or the newest. */
export async function frontPageClaim(block: FrontPageData, context?: SectionContext): Promise<{ candidates: (string | number)[]; take: number; pinned: (string | number)[] }> {
  const { arrangeFront, TOP_COUNT } = await import('@/lib/home-blocks/load')
  const { lead, top } = await arrangeFront(block, storyScopeOf(context))
  const ids = [lead, ...top].filter((s): s is NonNullable<typeof s> => Boolean(s)).map((s) => s.id)
  return { candidates: [], take: TOP_COUNT + 1, pinned: ids }
}

/** Front page lead. Draws nothing when no story is published. The stories come from the page's ordered pass when the page has one, else from the same arrangement. */
export async function FrontPageSection({ block, context }: SectionProps<FrontPageData>) {
  const { arrangeFront, storiesByIds } = await import('@/lib/home-blocks/load')
  const claimed = block.id ? context.claims?.get(block.id) : undefined
  const { lead, top } = claimed
    ? await (async () => {
        const [first, ...rest] = await storiesByIds(claimed, storyScopeOf(context))
        return { lead: first ?? null, top: rest }
      })()
    : await arrangeFront(block, storyScopeOf(context))
  if (!lead) return null
  // Loaded when it draws: the view reads story fields and the block registry is read by the Payload config.
  const { Briefing, FirstScreen, LeadArticle } = await import('@/components/Homepage/FrontPage')
  const topUnit = topUnitOf(context)
  const fitsFirstScreen = context.setId === 'home'
  return (
    <SectionBand block={block} tight={Boolean(topUnit)}>
      {/* The first screen (`FirstScreen`): the lead and the page's top unit (`home.top`, when its set has one), together as tall as the window leaves below the header, so The
          Briefing starts just under the fold. The unit is directly under the header on a wide screen, so above the lead; on a phone it is after the lead's headline and picture
          and before The Briefing. One element, ordered by the screen, so it is drawn (and counted) once. With a unit the band's top padding is the tight one (`tight`), and the
          first screen subtracts that smaller padding (`bandTight`). */}
      {/* Only the home page fits its first screen: there the lead's picture takes the height the window leaves. On a hub (The Voyager) the lead is a section's front page, not the whole first
          screen, so its picture keeps to its own shape (16:9, and from a wide screen as tall as its words, at least 24rem) and The Briefing follows at once. */}
      {fitsFirstScreen ? (
        <FirstScreen offset={topUnit ? 'bandTight' : 'band'}>
          <LeadArticle className="order-1 md:order-2 lg:flex-1" lead={lead} leadKicker={block.leadKicker?.trim() || null} />
          <TopUnit className="order-2 mt-8 md:order-1 md:mb-6 md:mt-0" tile={topUnit} />
        </FirstScreen>
      ) : (
        <div className="flex flex-col">
          <LeadArticle className="order-1 md:order-2" lead={lead} leadKicker={block.leadKicker?.trim() || null} />
          <TopUnit className="order-2 mt-8 md:order-1 md:mb-6 md:mt-0" tile={topUnit} />
        </div>
      )}
      <Briefing top={top} />
    </SectionBand>
  )
}
