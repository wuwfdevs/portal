// What fills the home page's feature slots below the news (boards 1 and 2): short videos, podcasts, RadioLive and Unearthing Florida.
// Editors may pin a choice; anything they leave empty, or a choice that is no longer published, is filled from the newest work, and a
// slot with nothing to show is left out rather than drawn empty. Pure: the loader hands it records the public may already read.

type Id = string | number
const same = (a: Id | null | undefined, b: Id | null | undefined): boolean => a != null && b != null && String(a) === String(b)
const time = (iso: string | null | undefined): number => {
  const t = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

export const VIDEO_COUNT = { min: 3, max: 10, fallback: 6 } as const

/** The number of clips the row holds, kept within bounds whatever is stored. */
export function videoCount(stored: number | null | undefined): number {
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return VIDEO_COUNT.fallback
  return Math.min(VIDEO_COUNT.max, Math.max(VIDEO_COUNT.min, Math.round(stored)))
}

/**
 * The clips for the short-video row: the chosen series' newest, topped up with the newest of the rest when the series has too few,
 * or simply the newest when no series is chosen. `clips` is newest first.
 */
export function pickClips<T extends { id: Id; series: { id: Id } | null }>(clips: readonly T[], opts: { seriesId: Id | null; count: number }): T[] {
  const count = Math.max(0, opts.count)
  if (opts.seriesId == null) return clips.slice(0, count)
  const fromSeries = clips.filter((c) => same(c.series?.id, opts.seriesId))
  const rest = clips.filter((c) => !same(c.series?.id, opts.seriesId))
  return [...fromSeries, ...rest].slice(0, count)
}

export interface ShowRow<E extends { publishedAt?: string | null }> {
  show: { id: Id }
  latest: E | null
}

/**
 * The podcast slot: one featured show with its newest episode, and up to `othersCount` other shows beside it. The featured show is the
 * editor's pick when it is listed and has a published episode, else the show with the newest episode. The others are the shows with the
 * newest episodes first; a show with none yet comes last. Null when no listed show has an episode.
 */
export function pickPodcasts<E extends { publishedAt?: string | null }, R extends ShowRow<E>>(rows: readonly R[], opts: { featuredId: Id | null; othersCount: number }): { featured: R & { latest: E }; others: R[] } | null {
  const byNewest = [...rows].sort((a, b) => time(b.latest?.publishedAt) - time(a.latest?.publishedAt))
  const pinned = rows.find((r) => same(r.show.id, opts.featuredId) && r.latest)
  const featured = (pinned ?? byNewest.find((r) => r.latest)) as (R & { latest: E }) | undefined
  if (!featured) return null
  return { featured, others: byNewest.filter((r) => r !== featured).slice(0, Math.max(0, opts.othersCount)) }
}

/** The RadioLive panel: the next show and the newest recorded set. Null when there is neither, so the panel is left out. */
export function pickRadioLive<S>(input: { upcoming: readonly S[]; latest: S | null }): { next: S | null; latest: S | null } | null {
  const next = input.upcoming[0] ?? null
  return next || input.latest ? { next, latest: input.latest } : null
}
