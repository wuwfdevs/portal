import type { SectionNavItem } from '@/components/SectionNav'

import type { RadioLiveData } from './load'

/**
 * The RadioLive page's sub-navigation: one link for each part of the page that is actually there. A link to a part that is not
 * rendered (no artists yet, no Encores text) would go nowhere, so it is left out. Shows and Watch always render (each has an
 * empty state), so they are always listed.
 */
export function radioLiveNavItems(data: Pick<RadioLiveData, 'artists' | 'host' | 'encores' | 'support' | 'membership'>): SectionNavItem[] {
  const items: SectionNavItem[] = [
    { label: 'Shows', href: '#shows' },
    { label: 'Watch', href: '#watch' },
  ]
  if (data.artists.length > 0) items.push({ label: 'Artists', href: '#artists' })
  if (data.encores.heading || data.encores.text) items.push({ label: 'Encores', href: '#encores' })
  if (data.host.heading || data.host.text) items.push({ label: 'About', href: '#about' })
  if (data.support.heading || data.support.text || data.membership) items.push({ label: 'Support', href: '#support' })
  return items
}
