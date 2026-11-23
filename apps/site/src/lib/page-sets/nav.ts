import type { SectionNavItem } from '@/components/SectionNav'
import { safeHref } from '@/lib/section-links'
import { isValidAnchor } from '@/lib/sections-anchors'

import type { PageSetId } from './registry'

export interface SetNavSection {
  anchor?: string | null
  navLabel?: string | null
  /** A page the link goes to instead of the section (a section that has a page of its own: a news run's section page). */
  navHref?: string | null
  hidden?: boolean | null
}

export interface SetNavPage {
  title?: string | null
  path?: string | null
  navLabel?: string | null
  navOrder?: number | null
  /** A page that asks search engines not to list it (the thank-you page) is a place a visitor ends up, not one to browse to: it is left out of the strip. */
  noindex?: boolean | null
  /** A page the strip does not list as a link of its own (a show's home: the strip's title links to it). Its sections' links still show. */
  navHidden?: boolean | null
  /** The show's home page has no path of its own; its address is the show's. */
  isShowHome?: boolean | null
  /** The sections that asked for a link (a name and an anchor), in the page's order. */
  sections?: ReadonlyArray<SetNavSection | null | undefined> | null
}

/** The cache tag the set's navigation is read under; saving a page in the set revalidates it, so every page in the set shows the change. */
export const setNavTag = (set: PageSetId): string => `page-set_${set}`

/**
 * The strip of a page set (or of one show's pages): one link for each published page in it, in `navOrder` (pages without one last, then by title), labelled `navLabel` or else the title,
 * with the page the reader is on marked. After a page's own link come the links its sections asked for (`navLabel` on a section with an anchor), so a hub's strip can reach its own parts
 * (Episodes, Explore, Collections) as well as its other pages; on the page itself such a link is `#anchor`, from another page it is `/page#anchor`. A show's home page has the show's address
 * (`showPath`). A strip with fewer than two links has nothing to move between, so it has none.
 */
export function setNavItems(pages: ReadonlyArray<SetNavPage | null | undefined>, currentPath: string, options: { showPath?: string | null } = {}): SectionNavItem[] {
  const rows = pages
    .map((p) => (p && !p.noindex ? { p, address: p.isShowHome ? (options.showPath ?? null) : typeof p.path === 'string' ? p.path : null } : null))
    .filter((r): r is { p: SetNavPage; address: string } => r !== null && typeof r.address === 'string' && r.address.startsWith('/'))
    .map(({ p, address }) => ({ p, address, label: p.navLabel?.trim() || p.title?.trim() || '', order: typeof p.navOrder === 'number' ? p.navOrder : Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order))
  const items: SectionNavItem[] = []
  for (const { p, address, label } of rows) {
    if (label && !p.navHidden) items.push({ label, href: address, current: address === currentPath })
    for (const s of p.sections ?? []) {
      const name = s?.navLabel?.trim()
      if (!s || s.hidden || !name) continue
      // A section that has a page of its own links to that page (a news run's section, a list's full page), so the strip leads to the page and not to a part of this one.
      const page = safeHref(s.navHref)
      if (page && !page.startsWith('#')) {
        items.push({ label: name, href: page, current: page === currentPath })
        continue
      }
      const anchor = s.anchor?.trim()
      if (!anchor || !isValidAnchor(anchor)) continue
      items.push({ label: name, href: address === currentPath ? `#${anchor}` : `${address}#${anchor}` })
    }
  }
  return items.length < 2 ? [] : items
}

/**
 * Where the strip's title goes: the set's first page (the show's home for a show's set, which has no address of its own), even when that page is left out of the strip's links. The title is the way
 * back to the start, so it must not be the strip's first link, which on a page left out of the strip is a part of the page (`#episodes`).
 */
export function setHomeHref(pages: ReadonlyArray<SetNavPage | null | undefined>, options: { showPath?: string | null } = {}): string | null {
  const rows = pages
    .map((p) => (p && !p.noindex ? { p, address: p.isShowHome ? (options.showPath ?? null) : typeof p.path === 'string' ? p.path : null } : null))
    .filter((r): r is { p: SetNavPage; address: string } => r !== null && typeof r.address === 'string' && r.address.startsWith('/'))
    .map(({ p, address }) => ({ address, label: p.navLabel?.trim() || p.title?.trim() || '', order: typeof p.navOrder === 'number' ? p.navOrder : Number.POSITIVE_INFINITY }))
    .sort((a, b) => (a.order === b.order ? a.label.localeCompare(b.label) : a.order - b.order))
  return rows[0]?.address ?? null
}
