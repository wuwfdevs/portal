import type { SitePermission } from '@wuwf/portal-contracts'

import { userCan } from '@/access/permissions'
import type { ThemeId } from '@/lib/page-themes/themes'

/**
 * Page sets (PAGE-BLOCKS.md → Page sets). Code, in the manner of placement zones (`lib/placements/registry.ts`): a set is a small record
 * here and a page chooses one. A set gives a page: its default theme, who may edit it, a sub-navigation of the pages in the set, and
 * which set-only blocks the picker offers (a block names the sets it belongs to in its own definition, `blocks/sections/registry.ts`).
 *
 * A page with no set is a plain page: the station's theme, `content.write` to edit, library blocks only.
 */
export const PAGE_SET_IDS = ['sponsor', 'giving', 'listens', 'voyager', 'unearthing', 'radiolive'] as const
export type PageSetId = (typeof PAGE_SET_IDS)[number]

export interface PageSetSpec {
  id: PageSetId
  /** The name staff see, and the sub-navigation's label. */
  name: string
  /** The theme its pages render in unless a page chooses another. A theme that is not built renders as the station's. */
  theme: ThemeId
  /** Any one of these permissions lets staff edit (and, for the first, publish) pages in the set. */
  editBy: readonly SitePermission[]
  /** Whether the sponsor-and-giving style footer line (the settings global's `serviceLine`) is printed under the last section. */
  footerLine: boolean
  /**
   * Whether a page in the set may carry sponsor placements (its slots, `PLACEMENTS.md`). The giving pages are where a gift is made and the Listens pages are a listener's
   * conversation with the station: a sponsor message sits in neither (the proposed rule in `PLACEMENTS.md`, decided 2026-11-20).
   */
  placements: boolean
  /** Whether the set draws a strip of its pages under the header. The Listens pages are two screens of one flow, not a place to browse between. */
  subNav: boolean
}

export const PAGE_SETS: Readonly<Record<PageSetId, PageSetSpec>> = {
  sponsor: { id: 'sponsor', name: 'Sponsorship', theme: 'wuwf', editBy: ['content.publish'], footerLine: true, placements: false, subNav: true },
  giving: { id: 'giving', name: 'Ways to give', theme: 'wuwf', editBy: ['membership.manage', 'content.publish'], footerLine: true, placements: false, subNav: true },
  listens: { id: 'listens', name: 'WUWF Listens', theme: 'wuwf', editBy: ['content.write'], footerLine: false, placements: false, subNav: false },
  voyager: { id: 'voyager', name: 'The Voyager', theme: 'voyager', editBy: ['content.write'], footerLine: false, placements: true, subNav: true },
  unearthing: { id: 'unearthing', name: 'Unearthing Florida', theme: 'unearthing', editBy: ['content.write'], footerLine: false, placements: true, subNav: true },
  radiolive: { id: 'radiolive', name: 'RadioLive', theme: 'radiolive', editBy: ['content.write'], footerLine: false, placements: true, subNav: true },
}

/** What staff need to edit a page that is in no set. */
export const NO_SET_EDIT_BY: readonly SitePermission[] = ['content.write']

export function isPageSetId(value: unknown): value is PageSetId {
  return typeof value === 'string' && (PAGE_SET_IDS as readonly string[]).includes(value)
}

export function pageSetOf(value: unknown): PageSetSpec | null {
  return isPageSetId(value) ? PAGE_SETS[value] : null
}

type WithRoles = { roles?: readonly string[] | null } | null | undefined

/** Whether this staff member may edit pages in the set (or, for `null`, pages in no set). */
export function canEditSet(user: WithRoles, set: unknown): boolean {
  const spec = pageSetOf(set)
  const needs = spec ? spec.editBy : NO_SET_EDIT_BY
  return needs.some((p) => userCan(user, p))
}

/** Whether this staff member may publish pages in the set: a publisher anywhere, and membership staff in the giving set. */
export function canPublishSet(user: WithRoles, set: unknown): boolean {
  if (userCan(user, 'content.publish')) return true
  return set === 'giving' && userCan(user, 'membership.manage')
}

/** The sets (and whether "no set") this staff member may edit: for an access rule that narrows a query. */
export function editableSets(user: WithRoles): { sets: PageSetId[]; noSet: boolean } {
  return {
    sets: PAGE_SET_IDS.filter((id) => canEditSet(user, id)),
    noSet: canEditSet(user, null),
  }
}
