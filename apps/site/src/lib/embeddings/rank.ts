/**
 * Ranking rules for semantic search and similar stories. Pure and tested; the database and the page only feed it.
 *
 * **The thresholds below are starting values, not measurements.** Nothing was calibrated against WUWF's real archive (it is not
 * embedded yet). After the first backfill, run `scripts/embeddings/inspect.ts`, read the neighbours of a sample of stories, and
 * set the three numbers by eye (ROADMAP: Vector search and similar stories, "Calibrate").
 */

/** Cosine similarity (1 = same direction). A story must be at least this close to another to be offered as similar. */
export const MIN_RELATED_SIMILARITY = 0.35
/** A search query is short and a story is long, so their similarities run lower than story to story. */
export const MIN_SEARCH_SIMILARITY = 0.2
/** At most this many of the similar stories may come from one series or show: a run of instalments is not variety. */
export const MAX_PER_SERIES = 2

export const RELATED_LIMIT = 4
/** How many neighbours the database is asked for before the rules above thin them. */
export const RELATED_CANDIDATES = 30

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000

/**
 * A small preference for newer work, so that between two equally close stories the recent one leads. It never outweighs
 * closeness: it runs from 1.0 (published now) down to 0.85 (old), halving the gap every three years.
 */
export function recencyFactor(publishedAt: string | Date | null | undefined, now: Date): number {
  if (!publishedAt) return 0.85
  const ageMs = Math.max(0, now.getTime() - new Date(publishedAt).getTime())
  if (!Number.isFinite(ageMs)) return 0.85
  return 0.85 + 0.15 * 0.5 ** (ageMs / YEAR_MS / 3)
}

export type RelatedCandidate = {
  id: number | string
  similarity: number
  publishedAt?: string | null
  /** The series or show it belongs to, if any; stories sharing one are capped. */
  seriesKey?: string | null
}

/** The stories to offer under a story: closest first, with recency as the tie-breaker, thinned by the floor and the series cap. */
export function pickRelated(
  selfId: number | string,
  candidates: readonly RelatedCandidate[],
  now: Date,
  options: { limit?: number; minSimilarity?: number; maxPerSeries?: number } = {},
): RelatedCandidate[] {
  const limit = options.limit ?? RELATED_LIMIT
  const floor = options.minSimilarity ?? MIN_RELATED_SIMILARITY
  const cap = options.maxPerSeries ?? MAX_PER_SERIES

  const scored = candidates
    .filter((c) => String(c.id) !== String(selfId) && c.similarity >= floor)
    .map((c) => ({ c, score: c.similarity * recencyFactor(c.publishedAt, now) }))
    .sort((a, b) => b.score - a.score || String(a.c.id).localeCompare(String(b.c.id)))

  const perSeries = new Map<string, number>()
  const picked: RelatedCandidate[] = []
  for (const { c } of scored) {
    if (picked.length >= limit) break
    if (c.seriesKey) {
      const used = perSeries.get(c.seriesKey) ?? 0
      if (used >= cap) continue
      perSeries.set(c.seriesKey, used + 1)
    }
    picked.push(c)
  }
  return picked
}
