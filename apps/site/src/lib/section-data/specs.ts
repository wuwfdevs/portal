// What a data block asks for, read defensively from its stored fields. Pure. A block whose fields do not name a usable source has no spec
// and draws nothing. Each spec is plain JSON (it is also part of a cache key), and a hidden variant's fields are never read.

import { relationId } from './shape'

export const LIST_SOURCES = ['stories', 'episodes', 'videos', 'artists', 'shows', 'clips', 'performances'] as const
export type ListSource = (typeof LIST_SOURCES)[number]
export const LIST_SCOPES = ['latest', 'section', 'topic'] as const
export type ListScope = (typeof LIST_SCOPES)[number]
export const LIST_MAX = 12

/**
 * `voyager: true` is set on a spec when the page is The Voyager's (`PageSetSpec.stories`): a list of stories, video stories or short videos on such a page reads only what was published under The
 * Voyager's identity, never the station's reporting under the student newspaper's name. It is part of the spec so it is part of the cache key.
 */
export type ListSpec =
  | { source: 'stories'; scope: 'latest'; count: number; voyager?: true }
  | { source: 'stories'; scope: 'section' | 'topic'; id: number | string; count: number; voyager?: true }
  | { source: 'episodes'; id: number | string; count: number }
  | { source: 'episodes'; all: true; count: number }
  | { source: 'shows' }
  | { source: 'videos'; count: number; voyager?: true }
  | { source: 'clips'; scope: 'latest'; count: number; firstSeries?: number | string; voyager?: true }
  | { source: 'clips'; scope: 'section'; id: number | string; count: number; voyager?: true }
  | { source: 'artists'; count: number }
  | { source: 'performances'; count: number }

const count = (v: unknown, fallback: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.floor(v) : fallback
  return Math.min(max, Math.max(1, n))
}

/**
 * What a List reads, or null when its source needs a section, topic or show that is not chosen (or was deleted: a bare id still counts, and reads nothing). `pageShow` is the production
 * the page speaks for (`SectionContext.show`): a list of "Episodes of a show" with no show chosen lists that show's, so a show's home page needs no show typed on each list.
 */
export function listSpecOf(
  block: { source?: unknown; scope?: unknown; section?: unknown; topic?: unknown; show?: unknown; allShows?: unknown; count?: unknown; series?: unknown },
  pageShow?: { id: number | string } | null,
  storyScope: 'station' | 'voyager' = 'station',
): ListSpec | null {
  const spec = listSpecFor(block, pageShow)
  // On The Voyager's pages the story-reading sources read only The Voyager's (shows, episodes, artists and performances are not stories of an identity).
  return spec && storyScope === 'voyager' && (spec.source === 'stories' || spec.source === 'videos' || spec.source === 'clips') ? { ...spec, voyager: true } : spec
}

function listSpecFor(
  block: { source?: unknown; scope?: unknown; section?: unknown; topic?: unknown; show?: unknown; allShows?: unknown; count?: unknown; series?: unknown },
  pageShow?: { id: number | string } | null,
): ListSpec | null {
  const n = count(block.count, 6, LIST_MAX)
  switch (block.source) {
    case 'stories': {
      if (block.scope === 'section' || block.scope === 'topic') {
        const id = relationId(block.scope === 'section' ? block.section : block.topic)
        return id === null ? null : { source: 'stories', scope: block.scope, id, count: n }
      }
      return { source: 'stories', scope: 'latest', count: n }
    }
    case 'episodes': {
      if (block.allShows === true) return { source: 'episodes', all: true, count: n }
      const id = relationId(block.show) ?? relationId(pageShow)
      return id === null ? null : { source: 'episodes', id, count: n }
    }
    case 'videos':
      return { source: 'videos', count: n }
    case 'clips': {
      // The newest short videos, or the ones whose story is filed in a section (`lib/video/section`). A section that is not chosen (or was deleted) reads nothing.
      if (block.scope === 'section') {
        const id = relationId(block.section)
        return id === null ? null : { source: 'clips', scope: 'section', id, count: n }
      }
      // The newest, with one series' videos put first when the editor chose one (a series that was deleted leaves a bare id that matches nothing, so the newest show as they are).
      const firstSeries = relationId(block.series)
      return { source: 'clips', scope: 'latest', count: n, ...(firstSeries !== null ? { firstSeries } : {}) }
    }
    case 'artists':
      return { source: 'artists', count: n }
    case 'performances':
      return { source: 'performances', count: n }
    case 'shows':
      return { source: 'shows' }
    default:
      return null
  }
}

export type FeaturedSpec =
  | { mode: 'pick'; relationTo: 'posts' | 'productions'; id: number | string }
  | { mode: 'newest'; sectionId: number | string }

/** What a Featured record reads: a picked story or show, or the newest story of a section. */
export function featuredSpecOf(block: { mode?: unknown; record?: unknown; section?: unknown }): FeaturedSpec | null {
  if (block.mode === 'newest') {
    const sectionId = relationId(block.section)
    return sectionId === null ? null : { mode: 'newest', sectionId }
  }
  const rec = block.record !== null && typeof block.record === 'object' ? (block.record as { relationTo?: unknown; value?: unknown }) : null
  const id = relationId(rec?.value)
  return id !== null && (rec?.relationTo === 'posts' || rec?.relationTo === 'productions') ? { mode: 'pick', relationTo: rec.relationTo, id } : null
}

export const DATES_SOURCES = ['typed', 'radiolive', 'events'] as const
export const DATES_MAX = 12

export type DatesSpec = { source: 'radiolive' | 'events'; count: number } | { source: 'typed'; count: number }

/** What Dates reads. `typed` rows are in the block itself; the other two are read from the station's own records. */
export function datesSpecOf(block: { source?: unknown; count?: unknown }): DatesSpec | null {
  const n = count(block.count, 6, DATES_MAX)
  return block.source === 'radiolive' || block.source === 'events' || block.source === 'typed' ? { source: block.source, count: n } : null
}

export type CreditSpec = { relationTo: 'productions' | 'fellowships' | 'series'; id: number | string }

/** What Credit names: the production, fellowship or series whose agreement line it shows. */
export function creditSpecOf(block: { target?: unknown }): CreditSpec | null {
  const t = block.target !== null && typeof block.target === 'object' ? (block.target as { relationTo?: unknown; value?: unknown }) : null
  const id = relationId(t?.value)
  return id !== null && (t?.relationTo === 'productions' || t?.relationTo === 'fellowships' || t?.relationTo === 'series') ? { relationTo: t.relationTo, id } : null
}
