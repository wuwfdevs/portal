import type { SectionNavItem } from '@/components/SectionNav'

import type { PageSetId } from './registry'

export interface SetNavPage {
  title?: string | null
  path?: string | null
  navLabel?: string | null
  navOrder?: number | null
  /** A page that asks search engines not to list it (the thank-you page) is a place a visitor ends up, not one to browse to: it is left out of the strip. */
  noindex?: boolean | null
}

/** The cache tag the set's navigation is read under; saving a page in the set revalidates it, so every page in the set shows the change. */
export const setNavTag = (set: PageSetId): string => `page-set_${set}`

/**
 * The sub-navigation of a page set: one link for each published page in it, in `navOrder` (pages without one last, then by title), labelled
 * `navLabel` or else the title, with the page the reader is on marked. A set with one page has nothing to move between, so it has none.
 */
export function setNavItems(pages: ReadonlyArray<SetNavPage | null | undefined>, currentPath: string): SectionNavItem[] {
  const rows = pages
    .filter((p): p is SetNavPage & { path: string } => Boolean(p && !p.noindex && typeof p.path === 'string' && p.path.startsWith('/') && (p.navLabel?.trim() || p.title?.trim())))
    .map((p) => ({ label: (p.navLabel?.trim() || p.title?.trim()) as string, href: p.path, order: typeof p.navOrder === 'number' ? p.navOrder : Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order))
  if (rows.length < 2) return []
  return rows.map(({ label, href }) => ({ label, href, current: href === currentPath }))
}
