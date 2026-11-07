import type { Where } from 'payload'

/**
 * Site search (board 27): what can be searched, how a page's address reads, and how a result is labelled. Pure: the
 * page reads Payload's `search` collection (kept in sync by the search plugin) with the `where` built here.
 *
 * Every search document carries a `kind`, set when it is synced (`search/beforeSync.ts`), and the filters on the page
 * are groups of kinds. Search is a page, not a popup, so a search can be linked: `/search?q=flood&type=shows&page=2`.
 */

export const SEARCH_KINDS = ['story', 'live', 'episode', 'show', 'program', 'video'] as const
export type SearchKind = (typeof SEARCH_KINDS)[number]

export const SEARCH_FILTERS = [
  { value: 'all', label: 'All', kinds: [...SEARCH_KINDS] },
  { value: 'stories', label: 'Stories', kinds: ['story', 'live'] },
  { value: 'shows', label: 'Shows', kinds: ['episode', 'show', 'program'] },
  { value: 'video', label: 'Video', kinds: ['video'] },
] as const satisfies readonly { value: string; label: string; kinds: readonly SearchKind[] }[]

export type SearchFilter = (typeof SEARCH_FILTERS)[number]['value']

export const KIND_LABELS: Record<SearchKind, string> = {
  story: 'Story',
  live: 'Live updates',
  episode: 'Episode',
  show: 'Show',
  program: 'Program',
  video: 'Video',
}

export const SEARCH_PAGE_SIZE = 20
export const MAX_QUERY_LENGTH = 100
/** Past this, a page number is not a real page of results; it is someone probing the database. */
const MAX_PAGE = 50

export type SearchRequest = { q: string; type: SearchFilter; page: number }

const first = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? ''))

/** Reads the page's address. Anything malformed falls back to the default, never to an error. */
export function parseSearchParams(params: Record<string, string | string[] | undefined>): SearchRequest {
  const q = first(params.q).replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY_LENGTH)
  const rawType = first(params.type)
  const type = (SEARCH_FILTERS.find((f) => f.value === rawType)?.value ?? 'all') as SearchFilter
  const n = Number.parseInt(first(params.page), 10)
  const page = Number.isFinite(n) && n >= 1 ? Math.min(n, MAX_PAGE) : 1
  return { q, type, page }
}

/** The address of a search, leaving out what is at its default so links stay short. */
export function searchHref({ q, type, page }: Partial<SearchRequest>): string {
  const params = new URLSearchParams()
  if (q) params.set('q', q)
  if (type && type !== 'all') params.set('type', type)
  if (page && page > 1) params.set('page', String(page))
  const query = params.toString()
  return query ? `/search?${query}` : '/search'
}

/**
 * The query: every word must appear in the title or the description (so "flood insurance" finds the story about
 * flood insurance, not every story with "flood" in it), within the filter's kinds. Null for an empty search: the page
 * then shows the form, not the whole index.
 */
export function searchWhere({ q, type }: Pick<SearchRequest, 'q' | 'type'>): Where | null {
  const words = q.split(' ').filter((w) => w.length > 0).slice(0, 8)
  if (words.length === 0) return null
  const filter = SEARCH_FILTERS.find((f) => f.value === type) ?? SEARCH_FILTERS[0]
  const clauses: Where[] = words.map((word): Where => {
    const anyField: Where[] = [{ title: { like: word } }, { 'meta.description': { like: word } }]
    return { or: anyField }
  })
  if (filter.value !== 'all') clauses.push({ kind: { in: [...filter.kinds] } })
  return { and: clauses }
}

/** How a story is classed for search. An audio story attached to a show is that show's episode. */
export function postKind(post: { format?: string | null; production?: unknown }): SearchKind {
  if (post.format === 'live') return 'live'
  if (post.format === 'audio' && post.production) return 'episode'
  return 'story'
}

/** A show WUWF makes, or a program it only airs. */
export function productionKind(production: { kind?: string | null }): SearchKind {
  return production.kind === 'syndicated' ? 'program' : 'show'
}

export function isSearchKind(value: unknown): value is SearchKind {
  return typeof value === 'string' && (SEARCH_KINDS as readonly string[]).includes(value)
}

/** "1 result", "24 results", with the words searched for. */
export function countLine(total: number, q: string): string {
  return `${total} ${total === 1 ? 'result' : 'results'} for “${q}”`
}
