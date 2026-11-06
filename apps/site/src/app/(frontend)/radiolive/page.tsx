import type { Metadata } from 'next'

import { RadioLiveHub } from '@/components/RadioLive/RadioLiveHub'
import { loadRadioLive } from '@/lib/radiolive/load'
import { getCachedGlobal } from '@/utilities/getGlobals'

// The RadioLive page. "Upcoming" depends on today's date and an agreement has a term, so it refreshes on a schedule as well as when a
// show, an artist or the page's settings are saved.
export const revalidate = 1800

export default async function RadioLivePage() {
  const data = await loadRadioLive()
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return <RadioLiveHub data={data} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
}

export const metadata: Metadata = { title: 'RadioLive', description: 'Songwriters live from downtown Pensacola, on the air on 88.1 FM. Shows, full sets with captions and the artists.' }
