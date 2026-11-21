import type { Metadata } from 'next'
import React from 'react'

import { Banner } from '@/components/Banner'
import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { bannerFor } from '@/lib/banner'
import { loadBanner } from '@/lib/banner/load'
import { HOME_BLOCKS_PAGE } from '@/lib/homepage/to-sections'
import { topUnitHeldBack } from '@/lib/placements/exclusions'
import { loadHomePlacements } from '@/lib/placements/load'

const PATH = `/${HOME_BLOCKS_PAGE.slug}`

// The home page built from blocks, beside the coded home page (`/`), for comparison (PAGE-BLOCKS.md → Home). The page is a record in the home set (Pages → Home page
// (blocks)); this shell loads what a block never reads itself: the sponsor tiles for the set's slots and the site banner. It refreshes on the schedule the coded home page does,
// and a saved page, a published story, a placement or the banner refresh it at once. Not linked from anywhere, and not indexed.
export const revalidate = 300

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(PATH)

export default async function HomeBlocksPage() {
  const [placements, banner] = await Promise.all([loadHomePlacements(), loadBanner()])
  // The top unit yields to an emergency banner, as on the coded home page.
  const top = topUnitHeldBack(banner, 'home') ? null : placements.top
  return (
    <>
      <Banner banner={bannerFor(banner, 'home-page')} />
      <SectionsRoute path={PATH} query={{}} slots={{ top, rail: placements.rail, fillers: placements.fillers, band: placements.band }} />
    </>
  )
}
