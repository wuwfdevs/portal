import type { Metadata } from 'next'
import React from 'react'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'

const VOYAGER_PATH = '/voyager'

// The Voyager's hub is a page in the voyager set (Pages → The Voyager; hubs redesign, slice 5). This shell renders the record: `/voyager` is also a coded route, so the catch-all does not
// serve it (`CODED_SHELL_PATHS`). Its news runs, clips and shows refresh on their own windows, and a saved page or story refreshes it at once. Stories (`/voyager/<date>/<slug>`) and the
// section lists are still served by the catch-all route.
export const revalidate = 600

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(VOYAGER_PATH)

export default async function VoyagerPage() {
  return <SectionsRoute path={VOYAGER_PATH} query={{}} />
}
