import { getServerSideSitemapIndex } from 'next-sitemap'

import { getIndexRequests, siteUrl } from '@/lib/seo/sitemap-data'
import { sitemapUrl } from '@/lib/seo/sitemap-plan'

// The index of every sitemap. Files are added as stories are (see `lib/seo/sitemap-plan.ts`); nothing here is configured.
export async function GET() {
  const base = siteUrl()
  const requests = await getIndexRequests()
  return getServerSideSitemapIndex(requests.map((r) => sitemapUrl(r, base)))
}
