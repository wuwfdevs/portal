import type { NetworkCandidate, ParsedDocuments } from './types'

/**
 * How a source is polled. Pure: builds query strings and classifies results; the fetching and the saving are elsewhere.
 *
 * CDS gives a station no push (notifications are for NPR's internal users) and no cursors, so the poll is two honest questions:
 *  1. "What was published since I last looked?" (`publishDateTime=<since>...`, oldest first, so a run cut short by the page ceiling can
 *     move its cursor to the last story it saw and the next run carries on from there).
 *  2. "Are the stories I already hold still there, still unrestricted, and what do they say now?" (`ids=...`). A story that has gone is not
 *     announced; it is simply missing from the answer.
 * Only documented query parameters are used (CDS querying page, read 2026-11-18). `publishDateTime` is used rather than
 * `editorialLastModifiedDateTime` because a document without the optional second field never matches a range on it.
 */

/** CDS limits: at most 300 documents per request, and `limit + offset` at most 2000. */
export const CDS_MAX_LIMIT = 300
export const CDS_MAX_WINDOW = 2000
export const OWNER_HREF_BASE = 'https://organization.api.npr.org/v4/services/'

/** How a source's stories are found: by owner (an Organization V4 service id such as `s583`) or by one of NPR's collections (an integer). */
export type SourceFinder = { kind: 'owner'; serviceId: string } | { kind: 'collection'; collectionId: number }

export const ownerHrefForService = (serviceId: string): string => `${OWNER_HREF_BASE}${serviceId}`

/** A service id is "s" and digits. Anything else would put arbitrary text in a query string. */
export const isServiceId = (value: string): boolean => /^s\d+$/.test(value)

export const toRfc3339 = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z')

export type NewStoriesWindow = { since: Date; offset?: number; limit?: number }

export function buildNewStoriesQuery(finder: SourceFinder, window: NewStoriesWindow): string {
  const limit = window.limit ?? 100
  const offset = window.offset ?? 0
  if (!Number.isInteger(limit) || limit < 1 || limit > CDS_MAX_LIMIT) throw new Error(`CDS allows 1 to ${CDS_MAX_LIMIT} documents a request.`)
  if (!Number.isInteger(offset) || offset < 0 || limit + offset > CDS_MAX_WINDOW) throw new Error(`CDS allows limit + offset up to ${CDS_MAX_WINDOW}.`)
  const params = new URLSearchParams()
  params.set('profileIds', 'story')
  if (finder.kind === 'owner') {
    if (!isServiceId(finder.serviceId)) throw new Error(`"${finder.serviceId}" is not a service id (an s followed by digits).`)
    params.set('ownerHrefs', ownerHrefForService(finder.serviceId))
  } else {
    if (!Number.isInteger(finder.collectionId) || finder.collectionId < 1) throw new Error('A collection id is a positive whole number.')
    params.set('collectionIds', String(finder.collectionId))
  }
  params.set('publishDateTime', `${toRfc3339(window.since)}...`)
  params.set('sort', 'publishDateTime:asc')
  params.set('limit', String(limit))
  params.set('offset', String(offset))
  return params.toString()
}

/**
 * Where the next run starts: the newest publish time seen, minus an overlap (a story can be published a little late or arrive out of order;
 * saving is idempotent by CDS id, so seeing one twice costs nothing). Never moves backwards.
 */
export function nextCursor(seen: Pick<NetworkCandidate, 'publishedAt'>[], previous: Date, overlapMinutes = 60): Date {
  let newest = 0
  for (const s of seen) {
    const t = s.publishedAt ? Date.parse(s.publishedAt) : NaN
    if (Number.isFinite(t) && t > newest) newest = t
  }
  if (newest === 0) return previous
  const candidate = new Date(newest - overlapMinutes * 60_000)
  return candidate.getTime() > previous.getTime() ? candidate : previous
}

/** Queries that ask for specific stories by id, in chunks short enough for an address. */
export function buildRecheckQueries(ids: string[], chunk = 40): string[] {
  const unique = [...new Set(ids)]
  const queries: string[] = []
  for (let i = 0; i < unique.length; i += chunk) {
    const params = new URLSearchParams()
    params.set('ids', unique.slice(i, i + chunk).join(','))
    params.set('limit', String(Math.min(chunk, CDS_MAX_LIMIT)))
    queries.push(params.toString())
  }
  return queries
}

export type RecheckOutcome = {
  /** Held stories CDS no longer returns: pulled at the source. An editor is told; nothing is removed silently. */
  gone: string[]
  /** Held stories that are now flagged restricted: they must come down. */
  restricted: string[]
  /** Held stories still there, as CDS has them now, for re-pulling. */
  present: NetworkCandidate[]
}

export function classifyRecheck(heldIds: string[], answers: ParsedDocuments[]): RecheckOutcome {
  const seen = new Set(answers.flatMap((a) => a.seenIds))
  const restricted = new Set(answers.flatMap((a) => a.restrictedIds))
  const held = new Set(heldIds)
  return {
    gone: heldIds.filter((id) => !seen.has(id)),
    restricted: heldIds.filter((id) => restricted.has(id)),
    present: answers.flatMap((a) => a.candidates).filter((c) => held.has(c.cdsId)),
  }
}
