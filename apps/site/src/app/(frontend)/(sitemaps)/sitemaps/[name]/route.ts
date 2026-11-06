import { getServerSideSitemap } from 'next-sitemap'

import { getListEntries, getPagesEntries, getPostsChunk, getShowEntries, type SitemapUrl } from '@/lib/seo/sitemap-data'
import { parseSitemapName } from '@/lib/seo/sitemap-plan'

// One child sitemap: `/sitemaps/posts-<n>.xml`, `pages.xml`, `lists.xml` or `shows.xml`. Anything else, or a story file past the last, is a 404.
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const request = parseSitemapName(name)
  if (!request) return new Response('Not found', { status: 404 })

  let entries: SitemapUrl[]
  switch (request.kind) {
    case 'posts':
      entries = await getPostsChunk(request.page)
      break
    case 'pages':
      entries = await getPagesEntries()
      break
    case 'lists':
      entries = await getListEntries()
      break
    case 'shows':
      entries = await getShowEntries()
      break
  }
  if (entries.length === 0) return new Response('Not found', { status: 404 })
  return getServerSideSitemap(entries)
}
