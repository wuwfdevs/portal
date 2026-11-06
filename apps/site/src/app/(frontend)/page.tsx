import type { Metadata } from 'next'

import { HomepageView } from '@/components/Homepage/HomepageView'
import { loadHomepage } from '@/lib/homepage/load'
import { loadHomepageSlots } from '@/lib/homepage/load-slots'
import { getCachedGlobal } from '@/utilities/getGlobals'

// The front page changes whenever a story is published or the Home page global is saved (both refresh it at once), and
// on a short schedule besides, so a missed refresh heals itself within minutes.
export const revalidate = 300

export default async function HomePage() {
  const [data, slots, settings] = await Promise.all([loadHomepage(), loadHomepageSlots(), getCachedGlobal('site-settings', 1)()])
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return <HomepageView data={data} independenceHref={policy?.slug ? `/${policy.slug}` : null} slots={slots} />
}

export const metadata: Metadata = {
  title: { absolute: 'WUWF Public Media' },
  description: 'Public radio and journalism for Northwest Florida: local news, NPR, and WUWF originals from Pensacola.',
}
