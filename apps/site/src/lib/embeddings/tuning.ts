import { MAX_PER_SERIES, MIN_RELATED_SIMILARITY, MIN_SEARCH_SIMILARITY } from './rank'

/**
 * The three numbers an editor may tune (Site settings -> "Related stories and search by meaning"). Pure.
 *
 * The defaults are the starting values in `rank.ts` (uncalibrated until the archive is embedded and read by eye). Each setting has a
 * range, so a typo cannot switch recommendations off (a floor of 1 shows nothing) or fill every story with unrelated ones (a floor of 0
 * shows everything). A missing, blank or non-numeric value falls back to the default: a setting that was never saved changes nothing.
 */

export type EmbeddingTuning = {
  /** Cosine similarity a story must reach to be offered under another story. */
  relatedMinSimilarity: number
  /** Cosine similarity a story must reach to be offered as a search result by meaning (a query is short, so this runs lower). */
  searchMinSimilarity: number
  /** At most this many of the stories under a story may come from one series or show. */
  relatedMaxPerSeries: number
}

export const TUNING_LIMITS = {
  relatedMinSimilarity: { min: 0.1, max: 0.9, fallback: MIN_RELATED_SIMILARITY },
  searchMinSimilarity: { min: 0.05, max: 0.9, fallback: MIN_SEARCH_SIMILARITY },
  relatedMaxPerSeries: { min: 1, max: 4, fallback: MAX_PER_SERIES },
} as const

export const DEFAULT_TUNING: EmbeddingTuning = {
  relatedMinSimilarity: TUNING_LIMITS.relatedMinSimilarity.fallback,
  searchMinSimilarity: TUNING_LIMITS.searchMinSimilarity.fallback,
  relatedMaxPerSeries: TUNING_LIMITS.relatedMaxPerSeries.fallback,
}

type Raw = { relatedMinSimilarity?: unknown; searchMinSimilarity?: unknown; relatedMaxPerSeries?: unknown } | null | undefined

function read(value: unknown, key: keyof typeof TUNING_LIMITS): number {
  const { min, max, fallback } = TUNING_LIMITS[key]
  // Payload returns a Postgres numeric as a number, but a string from a hand-edited row must not become NaN.
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/** The tuning to use: the saved settings, each clamped to its range, or the default where nothing usable is saved. */
export function resolveTuning(settings: Raw): EmbeddingTuning {
  return {
    relatedMinSimilarity: read(settings?.relatedMinSimilarity, 'relatedMinSimilarity'),
    searchMinSimilarity: read(settings?.searchMinSimilarity, 'searchMinSimilarity'),
    relatedMaxPerSeries: Math.round(read(settings?.relatedMaxPerSeries, 'relatedMaxPerSeries')),
  }
}
