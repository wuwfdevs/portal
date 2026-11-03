// The addresses of story lists: a section (`/local-news`), a topic (`/tags/storms`) and a person (`/people/dave-dunwoody`),
// each with pages after the first at `<address>/page/<n>`. Grove used the first three shapes, so they are kept. Pure.

export type ListKind = 'section' | 'topic' | 'person'

export interface ListRequest {
  kind: ListKind
  slug: string
  /** 1-based. Page 1 is the plain address; `/page/1` does not exist. */
  page: number
}

export const PAGE_SIZE = 12

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/
const PAGE_NUMBER = /^[2-9]$|^[1-9]\d{1,3}$/ // 2 and up, up to four digits

/**
 * What a request's path segments mean as a list, or null when they are not one. Called after a story or page was ruled
 * out, so `/local-news` is a section only if no page took that address.
 */
export function parseListRequest(segments: readonly string[]): ListRequest | null {
  if (segments.length === 0) return null
  const [first, second] = segments
  const prefixed = first === 'tags' || first === 'people'
  const kind: ListKind = first === 'tags' ? 'topic' : first === 'people' ? 'person' : 'section'
  const slug = prefixed ? second : first
  const rest = segments.slice(prefixed ? 2 : 1)
  if (!slug || !SLUG.test(slug)) return null
  if (rest.length === 0) return { kind, slug, page: 1 }
  if (rest.length === 2 && rest[0] === 'page' && PAGE_NUMBER.test(rest[1]!)) return { kind, slug, page: Number(rest[1]) }
  return null
}

/** The address of a list page: the plain address for page 1, `/page/<n>` after it. */
export function listHref(kind: ListKind, slug: string, page = 1): string {
  const base = kind === 'topic' ? `/tags/${slug}` : kind === 'person' ? `/people/${slug}` : `/${slug}`
  return page > 1 ? `${base}/page/${page}` : base
}
