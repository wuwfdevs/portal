import type { Metadata } from 'next'
import React from 'react'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { LISTENS_HOST_PATH } from '@/lib/listening/hub-pages'
import { loadHub } from '@/lib/listening/load'

// The form offers the questions that invite hosts, which the Portal answers per request (with the reader's address hashed for its rate limit).
export const dynamic = 'force-dynamic'

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(LISTENS_HOST_PATH)

// Host a listening session is a page in the listens set. This route exists so `/listens/host` is a page and not a listening question's address
// (`/listens/<publicId>` is the next route up); it renders the record with its sections. The form works only if the Portal is set up; if it is not, sending says so.
export default async function HostPage() {
  return <SectionsRoute listeningHub={await loadHub()} path={LISTENS_HOST_PATH} query={{}} />
}
