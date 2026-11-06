// Seasons and episode numbers (phase 7; boards 21, 23). Pure: no Payload, no React.

const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty']

/** "Season One", as the boards write it; a number past twenty is written in digits. */
export function seasonName(n: number): string {
  return `Season ${Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : n}`
}

export type EpisodeType = 'full' | 'trailer' | 'bonus'

/** "Ep. 2", "Trailer" or "Bonus"; null when a full episode has no number. */
export function episodeLabel(n: number | null | undefined, type: EpisodeType | null | undefined = 'full'): string | null {
  if (type === 'trailer') return 'Trailer'
  if (type === 'bonus') return n == null ? 'Bonus' : `Bonus · Ep. ${n}`
  return n == null ? null : `Ep. ${n}`
}

export interface SeasonLike {
  id: string | number
  number: number
}
export interface EpisodeLike {
  season?: unknown
  episodeNumber?: number | null
  episodeType?: EpisodeType | null
  publishedAt?: string | null
}

const idOf = (v: unknown): string | null =>
  v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : typeof v === 'string' || typeof v === 'number' ? String(v) : null

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0)

/** Within a season: trailer first, then by episode number, then bonus episodes; ties (and unnumbered episodes) by date. */
function inSeasonOrder(a: EpisodeLike, b: EpisodeLike): number {
  const rank = (e: EpisodeLike) => (e.episodeType === 'trailer' ? 0 : e.episodeType === 'bonus' ? 2 : 1)
  if (rank(a) !== rank(b)) return rank(a) - rank(b)
  const na = a.episodeNumber ?? Number.POSITIVE_INFINITY
  const nb = b.episodeNumber ?? Number.POSITIVE_INFINITY
  if (na !== nb) return na - nb
  return time(a.publishedAt) - time(b.publishedAt)
}

export interface SeasonGroup<S, E> {
  /** Null for episodes that belong to no season. */
  season: S | null
  episodes: E[]
}

/**
 * Episodes grouped by season, newest season (highest number) first, each season in episode order; episodes with no season
 * (or a season not in the list) come last, newest first. Seasons with no episodes are left out.
 */
export function groupBySeason<S extends SeasonLike, E extends EpisodeLike>(seasons: readonly S[], episodes: readonly E[]): SeasonGroup<S, E>[] {
  const byId = new Map(seasons.map((s) => [String(s.id), s]))
  const buckets = new Map<string, E[]>()
  const loose: E[] = []
  for (const e of episodes) {
    const id = idOf(e.season)
    if (id !== null && byId.has(id)) buckets.set(id, [...(buckets.get(id) ?? []), e])
    else loose.push(e)
  }
  const groups: SeasonGroup<S, E>[] = [...seasons]
    .sort((a, b) => b.number - a.number)
    .filter((s) => buckets.has(String(s.id)))
    .map((s) => ({ season: s, episodes: [...buckets.get(String(s.id))!].sort(inSeasonOrder) }))
  if (loose.length > 0) groups.push({ season: null, episodes: [...loose].sort((a, b) => time(b.publishedAt) - time(a.publishedAt)) })
  return groups
}

/** The season "now airing": the one holding the newest published episode, or null. */
export function currentSeason<S extends SeasonLike>(seasons: readonly S[], episodes: readonly EpisodeLike[]): S | null {
  const newest = [...episodes].filter((e) => idOf(e.season) !== null).sort((a, b) => time(b.publishedAt) - time(a.publishedAt))[0]
  if (!newest) return null
  return seasons.find((s) => String(s.id) === idOf(newest.season)) ?? null
}
