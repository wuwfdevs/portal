import React from 'react'

import { relationId } from '@/lib/section-data/shape'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export interface FellowshipFeatureData extends SectionData {
  fellowship?: unknown
  story?: unknown
}

/** What the page's ordered pass asks of this block: the one story it features, taken before any news run. */
export async function fellowshipFeatureClaim(block: FellowshipFeatureData): Promise<{ candidates: (string | number)[]; take: number; pinned: (string | number)[] } | null> {
  const fellowshipId = relationId(block.fellowship)
  if (fellowshipId === null) return null
  const { loadFeature } = await import('@/lib/home-blocks/load')
  const feature = await loadFeature(fellowshipId, relationId(block.story))
  return { candidates: [], take: 1, pinned: feature?.story ? [feature.story.id] : [] }
}

/** Fellowship feature. Draws nothing without a fellowship (or once it is deleted). The funder line is the fellowship's agreements', in the neutral panel beside the story. */
export async function FellowshipFeatureSection({ block }: SectionProps<FellowshipFeatureData>) {
  const fellowshipId = relationId(block.fellowship)
  if (fellowshipId === null) return null
  const { loadFeature } = await import('@/lib/home-blocks/load')
  const feature = await loadFeature(fellowshipId, relationId(block.story))
  if (!feature) return null
  const { getCachedGlobal } = await import('@/utilities/getGlobals')
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  const { FellowshipFeatureBody } = await import('@/components/Homepage/FellowshipFeature')
  return (
    <SectionBand block={{ ...block, tone: block.tone ?? 'grey' }}>
      <FellowshipFeatureBody feature={feature} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
    </SectionBand>
  )
}
