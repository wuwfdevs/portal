import type { Metadata } from 'next'

import { draftMode } from 'next/headers'
import { notFound } from 'next/navigation'
import React, { cache } from 'react'

import type { HubLoad } from '@/lib/listening/load'
import type { Page } from '@/payload-types'

import { SectionsPageView, type SectionsPageData } from '@/components/Page/SectionsPageView'
import { generateMeta } from '@/utilities/generateMeta'
import { resolvePath } from '@/utilities/resolvePath'

/**
 * A coded route that renders one page record at its own address with the request's query (PAGE-BLOCKS.md → Rendering: "a page whose content must
 * come from the server per request stays a coded route that loads its record by path and renders it with `RenderSections`"). It is the same page, the
 * same blocks and the same editing; only the shell is code, so the query reaches the sections as `context.query` and never from the request itself.
 * The two giving pages that need it are `/support/ways` (`?way=` opens one way to give without script) and `/support/thanks` (`?name=&amount=&frequency=`).
 *
 * A page that is not there, or is not a sections page, or is not published (and the visitor is not previewing), is a 404.
 */
export const loadSectionsRecord = cache(async (path: string): Promise<{ page: Page; draft: boolean }> => {
  const { isEnabled: draft } = await draftMode()
  const hit = await resolvePath(path, draft)
  if (!hit || hit.kind !== 'page' || hit.doc.template !== 'sections') notFound()
  return { page: hit.doc, draft }
})

export async function SectionsRoute({ path, query, listeningHub }: { path: string; query: Record<string, string | string[] | undefined>; listeningHub?: HubLoad }) {
  const { page, draft } = await loadSectionsRecord(path)
  return <SectionsPageView draft={draft} listeningHub={listeningHub} page={page as unknown as SectionsPageData} query={query} url={path} />
}

export async function sectionsRouteMetadata(path: string): Promise<Metadata> {
  const { page } = await loadSectionsRecord(path)
  return generateMeta({ doc: page })
}
