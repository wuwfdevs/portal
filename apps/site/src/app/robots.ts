import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/seo/sitemap-data'

// Replaces the file `next-sitemap` wrote after every build: the sitemap is now a live route, so robots.txt names it directly.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', disallow: '/admin/*' }],
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
