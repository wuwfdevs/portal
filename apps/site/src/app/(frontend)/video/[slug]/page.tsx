import type { Metadata } from 'next'

import { notFound } from 'next/navigation'

import { ClipHub } from '@/components/Video/ClipView'
import { loadClipPage } from '@/lib/video/load'
import { getCachedGlobal } from '@/utilities/getGlobals'

export const revalidate = 3600

type Args = { params: Promise<{ slug: string }> }

export default async function ClipPage({ params }: Args) {
  const { slug } = await params
  const data = await loadClipPage(slug)
  if (!data) notFound()
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return <ClipHub data={data} independenceHref={policy?.slug ? `/${policy.slug}` : null} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const data = await loadClipPage(slug)
  if (!data) return {}
  const { clip } = data
  return {
    title: clip.title,
    description: clip.description ?? undefined,
    alternates: { canonical: `/video/${clip.slug}` },
    openGraph: { title: clip.title, ...(clip.description ? { description: clip.description } : {}), type: 'video.other', url: `/video/${clip.slug}`, ...(clip.posterUrl ? { images: [{ url: clip.posterUrl }] } : {}) },
  }
}
