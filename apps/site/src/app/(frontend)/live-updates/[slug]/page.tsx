import type { Metadata } from 'next'

import configPromise from '@payload-config'
import { notFound } from 'next/navigation'
import { getPayload } from 'payload'

import { LiveBlogView } from '@/components/Live/LiveBlogView'
import { loadLiveBlog } from '@/lib/live/load'

// A live blog is refreshed the moment an update is posted or the blog changes (hooks in collections/Live), and on a short
// schedule besides. Rendered ahead and cached, so a surge of readers during an emergency is served from cache.
export const revalidate = 60

type Args = { params: Promise<{ slug: string }> }

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const result = await payload.find({ collection: 'live-posts', draft: false, limit: 200, overrideAccess: false, pagination: false, select: { slug: true } })
  return result.docs.filter((d): d is typeof d & { slug: string } => typeof d.slug === 'string').map(({ slug }) => ({ slug }))
}

export default async function LiveBlogPage({ params }: Args) {
  const { slug } = await params
  const data = await loadLiveBlog(slug)
  if (!data) notFound()
  return <LiveBlogView data={data} />
}

export async function generateMetadata({ params }: Args): Promise<Metadata> {
  const { slug } = await params
  const data = await loadLiveBlog(slug)
  if (!data) return {}
  return { title: data.blog.title, description: data.blog.description ?? undefined }
}
