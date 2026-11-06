import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { ShowPageView } from '@/components/RadioLive/ShowPageView'
import { performanceTitle } from '@/lib/radiolive/arrange'
import { loadShow } from '@/lib/radiolive/load'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const revalidate = 1800

type Args = { params: Promise<{ slug: string }> }

export default async function ShowPage({ params }: Args) {
  const { slug } = await params
  const data = await loadShow(slug)
  if (!data) notFound()
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return <ShowPageView acknowledgments={data.acknowledgments} independenceHref={policy?.slug ? `/${policy.slug}` : null} show={data.show} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const data = await loadShow(slug)
  if (!data) return {}
  const title = performanceTitle(data.show)
  return { title: `${title} · RadioLive`, description: data.show.description ?? undefined, alternates: { canonical: `/radiolive/${data.show.slug}` } }
}
