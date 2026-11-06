// The shape of the site's sitemaps, as pure functions: how many files, what each is called, and which file a request names.
//
// `/sitemap.xml` is an index. Stories are split into numbered files of CHUNK_SIZE addresses each, so the count of files
// follows the count of stories with no configuration, and one file never nears the protocol's 50,000-address limit.
// Everything that is not a story has one file of its own. The database reads live in `sitemap-data.ts`.

/** Addresses per story file. Well under the 50,000 limit, and small enough that one file is a quick query and a small cache entry. */
export const CHUNK_SIZE = 2000

/** The protocol's hard limit on addresses in one file. */
export const PROTOCOL_MAX_URLS = 50_000

export type SitemapKind = 'pages' | 'lists' | 'shows' | 'video'

export type SitemapRequest = { kind: 'posts'; page: number } | { kind: SitemapKind }

const SINGLE_FILES: readonly SitemapKind[] = ['pages', 'lists', 'shows', 'video']

/** How many story files `total` stories need. None when there are no stories. */
export function chunkCount(total: number, size: number = CHUNK_SIZE): number {
  if (!Number.isFinite(total) || total <= 0) return 0
  return Math.ceil(total / size)
}

/** The file name (under `/sitemaps/`) of a request; the inverse of `parseSitemapName`. */
export function sitemapName(request: SitemapRequest): string {
  return request.kind === 'posts' ? `posts-${request.page}.xml` : `${request.kind}.xml`
}

/** What a file name under `/sitemaps/` asks for, or null when it is not one of ours (the route answers 404). Page numbers start at 1. */
export function parseSitemapName(name: string): SitemapRequest | null {
  const match = /^([a-z]+)(?:-([1-9]\d{0,3}))?\.xml$/.exec(name)
  if (!match) return null
  const [, kind, page] = match
  if (kind === 'posts') return page ? { kind: 'posts', page: Number(page) } : null
  if (page) return null
  return (SINGLE_FILES as readonly string[]).includes(kind!) ? { kind: kind as SitemapKind } : null
}

/** The address of one child file. */
export function sitemapUrl(request: SitemapRequest, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/sitemaps/${sitemapName(request)}`
}

/** Every file the index lists, in order: the single files, then the story files. A single file with nothing in it is left out. */
export function indexRequests(counts: { posts: number; pages: number; lists: number; shows: number; video: number }): SitemapRequest[] {
  const out: SitemapRequest[] = []
  if (counts.pages > 0) out.push({ kind: 'pages' })
  for (let page = 1; page <= chunkCount(counts.posts); page++) out.push({ kind: 'posts', page })
  if (counts.lists > 0) out.push({ kind: 'lists' })
  if (counts.shows > 0) out.push({ kind: 'shows' })
  if (counts.video > 0) out.push({ kind: 'video' })
  return out
}
