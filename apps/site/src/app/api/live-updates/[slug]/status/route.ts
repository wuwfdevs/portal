import configPromise from '@payload-config'
import { NextResponse } from 'next/server'
import { getPayload } from 'payload'

import { feedToken } from '@/lib/live/load'

// What the live page polls: is the blog still live, and has anything changed. Public and tiny; the response is cached for a
// few seconds at the edge so a crowd of readers polling costs the database one query, not thousands.
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'live-posts', where: { slug: { equals: slug } }, draft: false, depth: 0, limit: 1, overrideAccess: false, select: { coverage: true } })
  const blog = found.docs[0]
  if (!blog) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [count, latest] = await Promise.all([
    payload.count({ collection: 'live-updates', overrideAccess: false, where: { livePost: { equals: blog.id } } }),
    payload.find({ collection: 'live-updates', depth: 0, limit: 1, overrideAccess: false, pagination: false, select: { updatedAt: true }, sort: '-updatedAt', where: { livePost: { equals: blog.id } } }),
  ])
  return NextResponse.json(
    { live: blog.coverage !== 'ended', token: feedToken(count.totalDocs, latest.docs[0]?.updatedAt) },
    { headers: { 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20' } },
  )
}
