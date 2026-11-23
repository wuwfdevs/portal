import React from 'react'

import type { ExploreData } from '@/lib/explore/shape'

import { SectionBand } from '../SectionBand'
import type { SectionData, SectionProps } from '../types'

export type ExploreBlockData = SectionData

type Panel = React.ComponentType<{ sites: ExploreData['sites']; styleUrl: string | null; thisYear: number; label: string }>

/** The band and the panel in it, from data already read. Draws nothing without a site (a map with nothing to show is not shown). */
export function ExploreView({ block, data, styleUrl, thisYear, Panel }: { block: ExploreBlockData; data: ExploreData; styleUrl: string | null; thisYear: number; Panel: Panel }) {
  if (data.sites.length === 0) return null
  return (
    <SectionBand block={block} heading={block.heading}>
      <Panel label={block.heading?.title?.trim() || 'Sites'} sites={data.sites} styleUrl={styleUrl} thisYear={thisYear} />
    </SectionBand>
  )
}

/**
 * Explore. Reads the show the page speaks for (`SectionContext.show`) and draws nothing on a page that names none, for a show with no episode at a site, or when the read fails (the rest of
 * the page is still drawn). The basemap address is the station's setting (`MAP_STYLE_URL`, https only); without it the map asks nobody for anything.
 */
export async function ExploreSection({ block, context }: SectionProps<ExploreBlockData>) {
  const showId = context.show?.id
  if (showId === undefined) return null
  const { loadExplore } = await import('@/lib/explore/load')
  const data = await loadExplore(showId).catch((error: unknown) => {
    console.error('Explore could not be loaded and is left out.', error)
    return null
  })
  if (!data) return null
  const styleUrl = process.env.MAP_STYLE_URL?.startsWith('https://') ? process.env.MAP_STYLE_URL : null
  if (data.sites.length === 0) return null
  // The panel is a client component with the map loaded lazily inside it; the registry is read by the Payload CLI, so it is imported when the block draws.
  const { ExplorePanel } = await import('@/components/Explore/ExplorePanel')
  return ExploreView({ block, data, styleUrl, thisYear: new Date().getFullYear(), Panel: ExplorePanel })
}
