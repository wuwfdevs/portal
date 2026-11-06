// The database reads behind the sitemaps. Which files exist and what they are called is in `sitemap-plan.ts` (pure).
//
// Every read is cached. Story files are refreshed by the `posts-sitemap` tag, which the story hooks already revalidate on
// every publish, unpublish, move and delete; the others have no hook of their own and simply expire (SLOW_REVALIDATE).
// Story files are cut by id, oldest first, so a new story lands in the last file and the earlier ones keep their contents.

import config from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import { listHref } from '@/lib/lists/route'
import { pagePath } from '@/lib/paths'
import { sitemapEntry } from '@/lib/seo/meta'
import { CHUNK_SIZE, indexRequests, type SitemapRequest } from '@/lib/seo/sitemap-plan'

export type SitemapUrl = { loc: string; lastmod?: string }

/** How long the files that no hook refreshes may be stale. */
const SLOW_REVALIDATE = 600

export const siteUrl = (): string =>
  (process.env.NEXT_PUBLIC_SERVER_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || 'https://example.com').replace(/\/$/, '')

const published = { _status: { equals: 'published' } } as const

const countPosts = unstable_cache(
  async (): Promise<number> => {
    const payload = await getPayload({ config })
    return (await payload.count({ collection: 'posts', overrideAccess: false, where: published })).totalDocs
  },
  ['sitemap-posts-count'],
  { tags: ['posts-sitemap'] },
)

/** One numbered file of stories (1-based). Empty past the last file. `lastmod` is the story's real modified date, never the day it was imported. */
export const getPostsChunk = unstable_cache(
  async (page: number): Promise<SitemapUrl[]> => {
    const payload = await getPayload({ config })
    const base = siteUrl()
    const results = await payload.find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 0,
      limit: CHUNK_SIZE,
      page,
      sort: 'id',
      where: published,
      select: { path: true, updatedAt: true, publishedAt: true, legacy: { groveId: true, legacyPath: true, modifiedAt: true } },
    })
    return results.docs.flatMap((post) => {
      const entry = sitemapEntry(post, base)
      return entry ? [entry] : []
    })
  },
  ['sitemap-posts-chunk'],
  { tags: ['posts-sitemap'] },
)

/** Standard pages, the home page and the two fixed addresses. The fixed ones carry no `lastmod`: there is no true date for them. */
export const getPagesEntries = unstable_cache(
  async (): Promise<SitemapUrl[]> => {
    const payload = await getPayload({ config })
    const base = siteUrl()
    const results = await payload.find({
      collection: 'pages',
      overrideAccess: false,
      draft: false,
      depth: 0,
      limit: 5000,
      pagination: false,
      where: published,
      select: { slug: true, path: true, updatedAt: true, publishedAt: true, legacy: { groveId: true, legacyPath: true, modifiedAt: true } },
    })
    const fixed: SitemapUrl[] = [{ loc: `${base}${pagePath('search')}` }, { loc: `${base}/posts` }]
    const pages = results.docs.flatMap((page) => {
      const entry = sitemapEntry(page.slug === 'home' ? { ...page, path: '/' } : page, base)
      return entry ? [entry] : []
    })
    return [...fixed, ...pages]
  },
  ['sitemap-pages'],
  { tags: ['pages-sitemap'], revalidate: SLOW_REVALIDATE },
)

/** The first page of every section, topic and person list. No `lastmod`: a list has no date of its own. */
export const getListEntries = unstable_cache(
  async (): Promise<SitemapUrl[]> => {
    const payload = await getPayload({ config })
    const base = siteUrl()
    const slugs = async (collection: 'sections' | 'categories' | 'contributors'): Promise<string[]> => {
      const found = await payload.find({ collection, overrideAccess: false, depth: 0, limit: 20000, pagination: false, sort: 'slug', select: { slug: true } })
      return found.docs.map((d) => d.slug).filter((s): s is string => typeof s === 'string' && s !== '')
    }
    const [sections, topics, people] = await Promise.all([slugs('sections'), slugs('categories'), slugs('contributors')])
    return [
      ...sections.map((s) => ({ loc: `${base}${listHref('section', s)}` })),
      ...topics.map((s) => ({ loc: `${base}${listHref('topic', s)}` })),
      ...people.map((s) => ({ loc: `${base}${listHref('person', s)}` })),
    ]
  },
  ['sitemap-lists'],
  { revalidate: SLOW_REVALIDATE },
)

/** Show pages (original and syndicated) and the podcast directory. */
export const getShowEntries = unstable_cache(
  async (): Promise<SitemapUrl[]> => {
    const payload = await getPayload({ config })
    const base = siteUrl()
    const found = await payload.find({ collection: 'productions', overrideAccess: false, depth: 0, limit: 5000, pagination: false, sort: 'path', select: { path: true } })
    const shows = found.docs.flatMap((p) => (p.path ? [{ loc: `${base}${p.path}` }] : []))
    return shows.length > 0 ? [{ loc: `${base}/podcasts` }, ...shows] : []
  },
  ['sitemap-shows'],
  { revalidate: SLOW_REVALIDATE },
)

/** The short-video page and each published clip. `lastmod` is the clip's publish date, or none. */
export const getVideoEntries = unstable_cache(
  async (): Promise<SitemapUrl[]> => {
    const payload = await getPayload({ config })
    const base = siteUrl()
    const found = await payload.find({ collection: 'clips', overrideAccess: false, draft: false, depth: 0, limit: 5000, pagination: false, sort: '-publishedAt', where: published, select: { slug: true, publishedAt: true } })
    const clips = found.docs.flatMap((c) => (c.slug ? [{ loc: `${base}/video/${c.slug}`, ...(c.publishedAt ? { lastmod: c.publishedAt } : {}) }] : []))
    return clips.length > 0 ? [{ loc: `${base}/video` }, ...clips] : []
  },
  ['sitemap-video'],
  { tags: ['clips-sitemap'], revalidate: SLOW_REVALIDATE },
)

/** The files the index lists right now. */
export async function getIndexRequests(): Promise<SitemapRequest[]> {
  const [posts, pages, lists, shows, video] = await Promise.all([countPosts(), getPagesEntries(), getListEntries(), getShowEntries(), getVideoEntries()])
  return indexRequests({ posts, pages: pages.length, lists: lists.length, shows: shows.length, video: video.length })
}
