import React from 'react'

import { relationId } from '@/lib/section-data/shape'

import { SectionBand } from '../SectionBand'
import { SectionLink } from '../parts'
import type { SectionData, SectionProps } from '../types'

export interface ShowSpotlightData extends SectionData {
  featuredShow?: unknown
}

/** Show spotlight. Draws nothing when no listed show has an episode, and a read that fails leaves it out so the rest of the page draws. */
export async function ShowSpotlightSection({ block }: SectionProps<ShowSpotlightData>) {
  const { loadPodcastsSlot } = await import('@/lib/homepage/load-slots')
  const slot = await loadPodcastsSlot(relationId(block.featuredShow)).catch((error: unknown) => {
    console.error('The show spotlight could not be loaded and is left out.', error)
    return null
  })
  if (!slot) return null
  const { getCachedGlobal } = await import('@/utilities/getGlobals')
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  const { PodcastsBody } = await import('@/components/Homepage/Slots')
  const heading = block.heading?.title?.trim() ? block.heading : { eyebrow: 'WUWF originals', title: 'Podcasts made in Pensacola' }
  return (
    <SectionBand block={{ ...block, tone: block.tone ?? 'grey' }} heading={heading} more={<SectionLink href="/podcasts" label="All podcasts" />}>
      <PodcastsBody independenceHref={policy?.slug ? `/${policy.slug}` : null} slot={slot} />
    </SectionBand>
  )
}
