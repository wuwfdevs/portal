import type { Metadata } from 'next'
import React from 'react'

import { Banner } from '@/components/Banner'
import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { bannerFor } from '@/lib/banner'
import { loadBanner } from '@/lib/banner/load'
import { HOME_PAGE, HOME_PAGE_PATH } from '@/lib/homepage/to-sections'
import { topUnitHeldBack } from '@/lib/placements/exclusions'
import { loadHomePlacements } from '@/lib/placements/load'

// The home page is a page record in the home set (Pages → Home page; its address name is `home`, which is served here, at `/`). This shell loads what a block never reads itself:
// the sponsor tiles for the set's slots and the site banner (`/` is in `CODED_SHELL_PATHS`, so it is rendered here per refresh, not prerendered by the catch-all). It refreshes every
// five minutes, and a saved page, a published story, a placement or the banner refresh it at once.
export const revalidate = 300

export async function generateMetadata(): Promise<Metadata> {
  const meta = await sectionsRouteMetadata(HOME_PAGE_PATH)
  // The page's own title is "Home page", a name for editors; the tab reads the station's name unless an editor wrote an SEO title (which `generateMeta` returns as the title).
  const written = typeof meta.title === 'string' && meta.title !== HOME_PAGE.title ? meta.title : null
  return { ...meta, title: { absolute: written ?? HOME_PAGE.seoTitle }, description: meta.description ?? HOME_PAGE.summary }
}

export default async function HomePage() {
  const [placements, banner] = await Promise.all([loadHomePlacements(), loadBanner()])
  // The top unit yields to an emergency banner.
  const top = topUnitHeldBack(banner, 'home') ? null : placements.top
  return (
    <>
      <Banner banner={bannerFor(banner, 'home-page')} />
      <SectionsRoute path={HOME_PAGE_PATH} query={{}} slots={{ top, rail: placements.rail, fillers: placements.fillers, band: placements.band }} />
    </>
  )
}
