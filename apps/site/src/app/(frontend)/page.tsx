import type { Metadata } from 'next'

import { HomepageView } from '@/components/Homepage/HomepageView'
import { loadHomepage } from '@/lib/homepage/load'
import { loadHomepageSlots } from '@/lib/homepage/load-slots'
import { loadHomePlacements } from '@/lib/placements/load'
import { membershipAppealOf } from '@/lib/shared-text'
import { getCachedGlobal } from '@/utilities/getGlobals'

// The front page changes whenever a story is published or the Home page global is saved (both refresh it at once), and
// on a short schedule besides, so a missed refresh heals itself within minutes.
export const revalidate = 300

export default async function HomePage() {
  const [data, slots, placements, settings, sharedText] = await Promise.all([
    loadHomepage(),
    loadHomepageSlots(),
    loadHomePlacements(),
    getCachedGlobal('site-settings', 1)(),
    getCachedGlobal('shared-text', 0)(),
  ])
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return (
    <HomepageView
      appeal={membershipAppealOf(sharedText?.membershipAppeal)}
      data={data}
      independenceHref={policy?.slug ? `/${policy.slug}` : null}
      placements={placements}
      slots={slots}
    />
  )
}

export const metadata: Metadata = {
  title: { absolute: 'WUWF Public Media' },
  description: 'Public radio and journalism for Northwest Florida: local news, NPR, and WUWF originals from Pensacola.',
}
