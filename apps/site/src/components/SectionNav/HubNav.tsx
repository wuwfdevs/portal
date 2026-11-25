import React from 'react'

import { SectionNav } from '@/components/SectionNav'
import { loadSetNavPages } from '@/lib/page-sets/load'
import { setHomeHref, setNavItems } from '@/lib/page-sets/nav'
import { PAGE_SETS, pageSetOf, type PageSetId, type PageSetSpec } from '@/lib/page-sets/registry'
import { resolveTheme } from '@/lib/page-themes/themes'

/** The sets that are hubs: a named place with a strip of its own that is not about one show (Unearthing's strip belongs to its show's pages). */
const HUB_SETS: readonly PageSetSpec[] = Object.values(PAGE_SETS).filter((s) => s.subNav && s.navTitle && !s.perShow)

/**
 * The hub whose strip links to this address, or null. A page that is not a record of the hub (a section's list of stories, which the Voyager's strip links to) is still one of its
 * pages for the reader, so it keeps the strip. Reads the sets' cached navigation, so it costs no query beyond what a hub page already makes.
 */
export async function hubSetLinkingTo(path: string): Promise<PageSetId | null> {
  for (const set of HUB_SETS) {
    const nav = await loadSetNavPages(set.id, null)()
    if (setNavItems(nav.pages, path).some((i) => i.current)) return set.id
  }
  return null
}

/**
 * The hub's strip on a page that is not a record of the hub (a story the hub published, a section list its strip links to), so a reader moving through a hub's pages keeps the same way
 * around. It draws inside its own page theme, since the strip takes its ground from the theme; `url` marks the current link when the page is one of the strip's. A hub with fewer than two
 * links has no strip, and so nothing is drawn.
 */
export async function HubNav({ setId, url }: { setId: PageSetId; url: string }) {
  const set = pageSetOf(setId)
  if (!set || !set.subNav) return null
  const nav = await loadSetNavPages(set.id, null)()
  const items = setNavItems(nav.pages, url)
  if (items.length === 0) return null
  const theme = resolveTheme(null, set.theme)
  return (
    <div data-page-theme={theme.id}>
      <SectionNav band={theme.nav} hideTitle={!set.navTitle} homeHref={setHomeHref(nav.pages) ?? undefined} items={items} label={set.name} />
    </div>
  )
}
