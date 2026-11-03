import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { UnearthingHub } from '@/components/Unearthing/UnearthingHub'
import { loadUnearthingHub } from '@/lib/unearthing/load'
import { getCachedGlobal } from '@/utilities/getGlobals'

// The Unearthing Florida hub. Agreements have terms, so the page refreshes on a schedule as well as when the hub, a site, the
// production or an episode is saved. Pages after the first of the series' plain story list (`/unearthing-florida/page/2`) and every
// episode (`/unearthing-florida/<date>/<slug>`) are still served by the catch-all route.
export const revalidate = 3600

export default async function UnearthingFloridaPage() {
  const data = await loadUnearthingHub()
  if (!data) notFound()
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return <UnearthingHub data={data} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
}

export async function generateMetadata(): Promise<Metadata> {
  const data = await loadUnearthingHub()
  if (!data) return {}
  return { title: data.production.title, description: data.production.summary ?? undefined }
}
