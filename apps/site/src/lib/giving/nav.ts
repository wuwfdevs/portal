import type { SectionNavItem } from '@/components/SectionNav'

import { GIVING_NAV_PAGES, GIVING_PATHS, type GivingPage } from './paths'

const DEFAULT_LABELS: Record<GivingPage, string> = { give: 'Membership', ways: 'Other ways to give', legacy: 'Leave a legacy', thanks: 'Thank you' }

type NavLabels = { title?: string | null; give?: string | null; ways?: string | null; legacy?: string | null } | null | undefined

/** The "Ways to give" strip: every page in it always renders, so all are always listed, under the names the admin gives them. */
export function givingNavItems(current: GivingPage, nav: NavLabels): SectionNavItem[] {
  return GIVING_NAV_PAGES.map((key) => ({ label: nav?.[key]?.trim() || DEFAULT_LABELS[key], href: GIVING_PATHS[key], current: key === current }))
}

export const givingNavTitle = (nav: NavLabels): string => nav?.title?.trim() || 'Ways to give'
