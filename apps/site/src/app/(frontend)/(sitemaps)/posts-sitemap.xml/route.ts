import { getServerSideSitemap } from 'next-sitemap'
import { getPayload } from 'payload'
import config from '@payload-config'
import { unstable_cache } from 'next/cache'

import { sitemapEntry } from '@/lib/seo/meta'

const getPostsSitemap = unstable_cache(
  async () => {
    const payload = await getPayload({ config })
    const SITE_URL =
      process.env.NEXT_PUBLIC_SERVER_URL ||
      process.env.VERCEL_PROJECT_PRODUCTION_URL ||
      'https://example.com'

    const results = await payload.find({
      collection: 'posts',
      overrideAccess: false,
      draft: false,
      depth: 0,
      limit: 1000,
      pagination: false,
      where: {
        _status: {
          equals: 'published',
        },
      },
      select: {
        path: true,
        updatedAt: true,
        publishedAt: true,
        legacy: { groveId: true, legacyPath: true, modifiedAt: true },
      },
    })

    // `lastmod` is the story's real modified date (Grove's, for a migrated story), never the day it was imported.
    const sitemap = (results.docs ?? []).flatMap((post) => {
      const entry = sitemapEntry(post, SITE_URL)
      return entry ? [entry] : []
    })

    return sitemap
  },
  ['posts-sitemap'],
  {
    tags: ['posts-sitemap'],
  },
)

export async function GET() {
  const sitemap = await getPostsSitemap()

  return getServerSideSitemap(sitemap)
}
