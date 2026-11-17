import type { SectionNavItem } from '@/components/SectionNav'

import type { SponsorshipContent } from './content'
import { SPONSOR_PATHS, type SponsorPage } from './paths'

const DEFAULT_LABELS: Record<SponsorPage, string> = { hub: 'Sponsor WUWF', onAir: 'On air', digital: 'Digital', events: 'Events and programs', audience: 'Audience', guidelines: 'Credit guidelines' }

/** The "For businesses" strip: all six pages always render, so all six are always listed, under the names the admin gives them. */
export function sponsorNavItems(current: SponsorPage, nav: SponsorshipContent['nav']): SectionNavItem[] {
  return (Object.keys(SPONSOR_PATHS) as SponsorPage[]).map((key) => ({ label: nav?.[key]?.trim() || DEFAULT_LABELS[key], href: SPONSOR_PATHS[key], current: key === current }))
}
