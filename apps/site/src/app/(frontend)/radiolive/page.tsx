import type { Metadata } from 'next'
import React from 'react'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { RADIOLIVE_HOME_PATH } from '@/lib/radiolive/paths'

// RadioLive is a page in the radiolive set (Pages → RadioLive; hubs redesign, slice 4). This shell renders the record: `/radiolive` is a first segment that routes own
// (`/radiolive/<show>`), so the catch-all does not serve it (`CODED_SHELL_PATHS`). "Upcoming" depends on today's date, so it refreshes on a schedule as well as when a show, an
// artist or the page is saved.
export const revalidate = 1800

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(RADIOLIVE_HOME_PATH)

export default async function RadioLivePage() {
  return <SectionsRoute path={RADIOLIVE_HOME_PATH} query={{}} />
}
