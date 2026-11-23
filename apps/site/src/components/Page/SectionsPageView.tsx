import React from 'react'

import { RenderSections } from '@/blocks/sections/RenderSections'
import type { SectionContext, SectionData } from '@/blocks/sections/types'
import { LivePreviewListener } from '@/components/LivePreviewListener'
import { PayloadRedirects } from '@/components/PayloadRedirects'
import { SectionNav } from '@/components/SectionNav'
import { HomeFoot } from '@/components/Page/HomeFoot'
import { FunderFoot } from '@/components/Page/FunderFoot'
import { SetFooter } from '@/components/Page/SetFooter'
import { loadSetNavPages } from '@/lib/page-sets/load'
import { setNavItems } from '@/lib/page-sets/nav'
import { pageSetOf } from '@/lib/page-sets/registry'
import { resolveTheme } from '@/lib/page-themes/themes'
import { relationId } from '@/lib/section-data/shape'

export interface SectionsPageData {
  id?: number | string
  title?: string | null
  pageSet?: string | null
  /** The production the page speaks for (`pages.show`): where the set's funder foot reads its agreements. */
  show?: unknown
  theme?: string | null
  sections?: SectionData[] | null
  /** A page that asks not to be listed (the thank-you page) shows no strip of its set's pages. */
  noindex?: boolean | null
}

/**
 * A page built from sections (`template: sections`). It reads the page record and the page set's navigation, never the request, so the page
 * stays cached (PAGE-BLOCKS.md → Rendering). The theme is the page's own choice, else its set's, else the station's. Its sub-navigation is
 * the set's published pages, through `components/SectionNav`. The home set also ends with `HomeFoot` (the way to every story, and the membership appeal).
 */
export async function SectionsPageView({
  page,
  draft,
  url,
  query,
  listeningHub,
  slots,
}: {
  page: SectionsPageData
  draft: boolean
  url: string
  query?: SectionContext['query']
  listeningHub?: SectionContext['listeningHub']
  slots?: SectionContext['slots']
}) {
  const set = pageSetOf(page.pageSet)
  const theme = resolveTheme(page.theme, set?.theme)
  const items = set && set.subNav ? setNavItems(await loadSetNavPages(set.id)(), url) : []
  return (
    <article data-page-theme={theme.id}>
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />
      {draft && <LivePreviewListener />}
      {set && set.subNav && !page.noindex && items.length > 0 && <SectionNav band={theme.nav} hideTitle={!set.navTitle} homeHref={items[0]?.href} label={set.name} items={items} />}
      <RenderSections sections={page.sections} context={{ themeId: theme.id, setId: set?.id ?? null, draft, pageId: page.id, ...(query ? { query } : {}), ...(listeningHub ? { listeningHub } : {}), ...(slots ? { slots } : {}) }} />
      {set && <SetFooter items={items} set={set} />}
      {set?.funderFoot && <FunderFoot productionId={relationId(page.show)} />}
      {set?.id === 'home' && <HomeFoot />}
    </article>
  )
}
