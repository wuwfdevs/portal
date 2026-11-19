import type { Metadata } from 'next'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { GIVING_PATHS } from '@/lib/giving/paths'

type Args = { searchParams: Promise<Record<string, string | string[] | undefined>> }

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(GIVING_PATHS.ways)

// Other ways to give is a page in the giving set (Pages → Giving). This route only hands it the query: `?way=stock` opens one way to give, as a plain
// link, so a way can be shared and the page works without script. The rest of the page is the record's sections.
export default async function OtherWaysRoute({ searchParams }: Args) {
  return <SectionsRoute path={GIVING_PATHS.ways} query={await searchParams} />
}
