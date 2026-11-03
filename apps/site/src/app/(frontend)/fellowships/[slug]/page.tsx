import type { Metadata } from 'next'

import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { FellowshipHub } from '@/components/Fellowship/FellowshipHub'
import { loadFellowshipHub } from '@/lib/fellowship/load'
import { getCachedGlobal } from '@/utilities/getGlobals'

// A fellowship's hub. Agreements have terms, so the page also refreshes on a schedule; editing the fellowship or an
// agreement revalidates it at once (hooks/revalidateUnderwriting).
export const revalidate = 3600

type Args = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({ collection: 'fellowships', limit: 200, overrideAccess: false, pagination: false, select: { slug: true } })
  return result.docs.filter((d): d is typeof d & { slug: string } => typeof d.slug === 'string').map(({ slug }) => ({ slug }))
}

export default async function FellowshipPage({ params }: Args) {
  const { slug } = await params
  const data = await loadFellowshipHub(slug)
  if (!data) notFound()

  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return <FellowshipHub data={data} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const data = await loadFellowshipHub(slug)
  if (!data) return {}
  return {
    title: `${data.fellowship.title} | WUWF`,
    description: data.fellowship.summary ?? undefined,
  }
}
