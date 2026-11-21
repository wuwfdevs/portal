import type { Metadata } from 'next'
import React from 'react'

import { SectionsRoute, sectionsRouteMetadata } from '@/components/Page/SectionsRoute'
import { loadHub } from '@/lib/listening/load'
import { LISTENS_PATH } from '@/lib/listening/hub-pages'

// The hub reads the Portal on every request, with the reader's address hashed for the Portal's rate limit.
export const dynamic = 'force-dynamic'

export const generateMetadata = (): Promise<Metadata> => sectionsRouteMetadata(LISTENS_PATH)

// WUWF Listens is a page in the listens set (Pages → WUWF Listens). This route only loads what the Portal answers, per request (the hashed address is request
// data, which a block never reads), and hands it to the page's sections through the page context. The words around it, the order of the sections and
// which are shown are the record's. The Ask WUWF box collects an email, so the IT-04 notice is in the form itself (and the host form's).
export default async function ListensPage() {
  return <SectionsRoute listeningHub={await loadHub()} path={LISTENS_PATH} query={{}} />
}
