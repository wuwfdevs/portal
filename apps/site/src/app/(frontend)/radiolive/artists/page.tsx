import type { Metadata } from 'next'
import React from 'react'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { RADIOLIVE_ARTISTS_PATH } from '@/lib/radiolive/paths'

// "All artists" is a page in the radiolive set (an Artist index block). It is a shell for the same reason as `/radiolive`: `/radiolive/artists/<artist>` is the next route down.
export const revalidate = 1800

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(RADIOLIVE_ARTISTS_PATH)

export default async function RadioLiveArtistsPage() {
  return <SectionsRoute path={RADIOLIVE_ARTISTS_PATH} query={{}} />
}
