import type { Metadata } from 'next'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { GIVING_PATHS } from '@/lib/giving/paths'

type Args = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// A donor's name and amount can be in this page's address. The page is for the donor alone: its record asks not to be indexed and to send no referrer
// (the page's `noindex` and `noReferrer`), so the address is not handed on. This route only hands the record the query; the thank-you section reads it strictly.
export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(GIVING_PATHS.thanks)

export default async function ThanksRoute({ searchParams }: Args) {
  return <SectionsRoute path={GIVING_PATHS.thanks} query={await searchParams} />
}
