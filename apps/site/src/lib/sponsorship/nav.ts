import type { SectionNavItem } from '@/components/SectionNav'

import { SPONSOR_PATHS } from './content'

/** The "For businesses" strip on every sponsorship page. All six pages always render, so all six are always listed. */
export function sponsorNavItems(current: keyof typeof SPONSOR_PATHS): SectionNavItem[] {
  const items: [keyof typeof SPONSOR_PATHS, string][] = [
    ['hub', 'Sponsor WUWF'],
    ['onAir', 'On air'],
    ['digital', 'Digital'],
    ['events', 'Events and programs'],
    ['audience', 'Audience'],
    ['guidelines', 'Credit guidelines'],
  ]
  return items.map(([key, label]) => ({ label, href: SPONSOR_PATHS[key], current: key === current }))
}
