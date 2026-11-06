import configPromise from '@payload-config'
import { getPayload } from 'payload'

import type { Audio, Contributor, Media, Post } from '@/payload-types'

import { siteUrl } from '@/lib/seo/sitemap-data'
import { buildFeed, type FeedEpisode } from '@/lib/shows/feed'

// A podcast feed at Grove's own address, `/podcast/<slug>/rss.xml`, so apps and directories that follow the old one keep working.
// Only an original production has one. Episodes without audio are left out. Cached by the CDN for ten minutes.
const MAX_EPISODES = 500
const named = <T extends object>(v: T | string | number | null | undefined): T | null => (v && typeof v === 'object' ? v : null)

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const payload = await getPayload({ config: configPromise })
  const show = (await payload.find({ collection: 'productions', where: { and: [{ slug: { equals: slug } }, { kind: { equals: 'original' } }] }, limit: 1, depth: 1, overrideAccess: false })).docs[0]
  if (!show) return new Response('Not found', { status: 404 })

  const base = siteUrl()
  const posts = await payload.find({
    collection: 'posts',
    depth: 1,
    draft: false,
    limit: MAX_EPISODES,
    overrideAccess: false,
    pagination: false,
    sort: '-publishedAt',
    select: { title: true, dek: true, path: true, publishedAt: true, featuredAudio: true, legacy: { groveId: true } },
    // Members' episodes are never in the public feed (their audio is not readable anyway); they arrive in member feeds (phase 7d).
    where: { and: [{ production: { equals: show.id } }, { format: { equals: 'audio' } }, { _status: { equals: 'published' } }, { membersOnly: { equals: false } }] },
  })

  const episodes = (posts.docs as Pick<Post, 'id' | 'title' | 'dek' | 'path' | 'publishedAt' | 'featuredAudio' | 'legacy'>[]).flatMap((p): FeedEpisode[] => {
    const audio = named<Audio>(p.featuredAudio as never)
    if (!audio?.url || !p.path) return []
    return [
      {
        id: p.id,
        title: p.title,
        url: `${base}${p.path}`,
        groveId: p.legacy?.groveId,
        summary: p.dek,
        publishedAt: p.publishedAt,
        audio: { url: audio.url.startsWith('http') ? audio.url : `${base}${audio.url}`, mimeType: audio.mimeType, bytes: audio.filesize, seconds: audio.durationSeconds },
      },
    ]
  })

  const hero = named<Media>(show.heroImage)
  const hosts = (show.hosts ?? []).map((h) => named<Contributor>(h)?.name).filter((n): n is string => Boolean(n))
  const xml = buildFeed(
    {
      title: show.title,
      url: `${base}${show.path ?? `/podcasts`}`,
      feedUrl: `${base}/podcast/${show.slug}/rss.xml`,
      summary: show.summary ?? show.tagline,
      authors: hosts.length > 0 ? hosts : ['WUWF Public Media'],
      imageUrl: hero?.url ? (hero.url.startsWith('http') ? hero.url : `${base}${hero.url}`) : null,
    },
    episodes,
  )
  return new Response(xml, { headers: { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } })
}
