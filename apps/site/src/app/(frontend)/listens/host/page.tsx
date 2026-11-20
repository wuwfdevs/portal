import type { Metadata } from 'next'
import React from 'react'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { LISTENS_HOST_PATH } from '@/lib/listening/hub-pages'

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(LISTENS_HOST_PATH)

// Host a listening session is a page in the listens set. This route exists so `/listens/host` is a page and not a listening question's address
// (`/listens/<publicId>` is the next route up); it renders the record with its sections. The form works only if the Portal is set up; if it is not, sending says so.
export default async function HostPage() {
  return <SectionsRoute path={LISTENS_HOST_PATH} query={{}} />
}
