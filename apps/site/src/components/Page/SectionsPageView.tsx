import React from 'react'

import { RenderSections } from '@/blocks/sections/RenderSections'
import type { SectionData } from '@/blocks/sections/types'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { SectionNav } from '@/components/SectionNav'
import { loadSetNavPages } from '@/lib/page-sets/load'
import { setNavItems } from '@/lib/page-sets/nav'
import { pageSetOf } from '@/lib/page-sets/registry'
import { resolveTheme } from '@/lib/page-themes/themes'

export interface SectionsPageData {
  id?: number | string
  title?: string | null
  pageSet?: string | null
  theme?: string | null
  sections?: SectionData[] | null
}

/**
 * A page built from sections (`template: sections`). It reads the page record and the page set's navigation, never the request, so the page
 * stays cached (PAGE-BLOCKS.md → Rendering). The theme is the page's own choice, else its set's, else the station's. Its sub-navigation is
 * the set's published pages, through `components/SectionNav`.
 */
export async function SectionsPageView({ page, draft, url }: { page: SectionsPageData; draft: boolean; url: string }) {
  const set = pageSetOf(page.pageSet)
  const theme = resolveTheme(page.theme, set?.theme)
  const items = set ? setNavItems(await loadSetNavPages(set.id)(), url) : []
  return (
    <article data-page-theme={theme.id}>
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />
      {draft && <LivePreviewListener />}
      {set && items.length > 0 && <SectionNav label={set.name} items={items} />}
      <RenderSections sections={page.sections} context={{ themeId: theme.id, setId: set?.id ?? null, draft, pageId: page.id }} />
    </article>
  )
}
