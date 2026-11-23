// The server reads behind the data blocks (Featured record, List, Dates, Credit). Each read goes through Payload's Local API with access
// control on (`overrideAccess: false`, published only), is shaped by `shape.ts` into plain JSON, and is cached with `unstable_cache` with
// its own `revalidate`: the page holding the block is then cached for at most that long, and no other page is affected (PAGE-BLOCKS.md
// → Rendering; the first Phase 0 finding of round 2). Nothing here reads request data, so a page holding these stays cached.
//
// A read that fails throws out of the cache (a failure is never cached) and the block draws nothing for it.
//
// Blocks import this file only dynamically, when they draw: the block registry is loaded by the Payload config, and this file loads the config.

import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload, type Where } from 'payload'

import { getCachedGlobal } from '@/utilities/getGlobals'
import { loadCalendar } from '@/lib/events/load'
import { zonedInstant } from '@/lib/events/schedule'
import { loadDirectory } from '@/lib/shows/load'
import { appearanceLine, appearances } from '@/lib/radiolive/arrange'
import { voyagerIdentityId } from '@/lib/home-blocks/load'
import { loadClips, type ClipView } from '@/lib/video/load'
import { pickClips } from '@/lib/homepage/slots'
import { clipsForSection } from '@/lib/video/section'
import { getFellowshipHubAcknowledgments, getProductionHubAcknowledgments, getSeriesHubAcknowledgments } from '@/lib/underwriting/load'
import type { AcknowledgmentLine } from '@/lib/underwriting/resolve'

import type { CreditSpec, DatesSpec, FeaturedSpec, ListSpec } from './specs'
import {
  artistListItem, episodeListItem, performanceDateItem, performanceListItem, productionFeatured, showListItem, storyFeatured, storyListItem, upcomingDates,
  DEFAULT_DURATION_HOURS, type DateItem, type FeaturedItem, type ListItem,
} from './shape'

/** How long each kind of read is kept, in seconds. The page holding the block is cached for no longer than this. */
export const SECTION_REVALIDATE = { list: 300, featured: 600, dates: 300, credit: 300 } as const

const TAGS = ['section-data']
const isNotFound = (e: unknown): boolean => typeof e === 'object' && e !== null && (e as { status?: unknown }).status === 404

/**
 * The time a time-dependent block uses, as an ISO instant, read through the same short cache so that a page holding such a block is
 * cached for no longer than `SECTION_REVALIDATE.dates` and its past dates drop off on the next regeneration.
 */
export const sectionClock = unstable_cache(async () => new Date().toISOString(), ['section-clock'], { revalidate: SECTION_REVALIDATE.dates, tags: TAGS })

const readList = async (spec: Exclude<ListSpec, { source: 'performances' | 'artists' }>): Promise<ListItem[]> => {
  const voyager: Where[] = 'voyager' in spec && spec.voyager ? [{ publishingIdentity: { equals: (await voyagerIdentityId()) ?? 0 } }] : []
  const payload = await getPayload({ config: configPromise })
  // The podcast directory's own read (every listed original show with its count, and the newest episodes across them) is the one source for
  // both: a show's page and the directory agree because they share it.
  if (spec.source === 'shows') {
    const { shows } = await loadDirectory()
    return shows.map((row) => showListItem(row.show, { episodes: row.episodes, latestPublishedAt: row.latest?.publishedAt })).filter((i): i is ListItem => i !== null)
  }
  if (spec.source === 'episodes' && 'all' in spec) {
    const { latestEpisodes } = await loadDirectory()
    return latestEpisodes.slice(0, spec.count).map((e) => episodeListItem(e, e.showTitle)).filter((i): i is ListItem => i !== null)
  }
  const where: Where =
    spec.source === 'stories'
      ? spec.scope === 'section'
        ? { section: { equals: spec.id } }
        : spec.scope === 'topic'
          ? { categories: { equals: spec.id } }
          : {}
      : spec.source === 'episodes'
        ? { and: [{ production: { equals: 'id' in spec ? spec.id : 0 } }, { format: { equals: 'audio' } }] }
        : { format: { equals: 'video' } }
  const found = await payload.find({ collection: 'posts', where: voyager.length > 0 ? { and: [where, ...voyager] } : where, depth: 1, limit: spec.count, sort: '-publishedAt', overrideAccess: false, draft: false })
  return found.docs.map(storyListItem).filter((i): i is ListItem => i !== null)
}
const cachedList = unstable_cache(readList, ['section-list'], { revalidate: SECTION_REVALIDATE.list, tags: [...TAGS, 'section-data:list'] })

const readClips = async (spec: Extract<ListSpec, { source: 'clips' }>): Promise<ClipView[]> => {
  // On The Voyager's pages only the clips of a Voyager story (a clip has no identity of its own: it takes its story's).
  const all = (await loadClips()).filter((c) => !spec.voyager || c.voyager)
  if (spec.scope === 'section') return clipsForSection(all, spec.id, spec.count)
  return pickClips(all, { seriesId: spec.firstSeries ?? null, count: spec.count })
}
const cachedClips = unstable_cache(readClips, ['section-clips'], { revalidate: SECTION_REVALIDATE.list, tags: [...TAGS, 'section-data:list', 'clips'] })

/** The short videos a List of clips shows: the newest, or the ones whose story is in a section. Empty when there are none. */
export async function loadClipList(spec: Extract<ListSpec, { source: 'clips' }>): Promise<ClipView[]> {
  return cachedClips(spec)
}

/**
 * RadioLive shows that are over and have a recording to watch (an address on YouTube or Vimeo, or a file in the video library), newest first. The clock is the cached one, so
 * a show that has just ended joins the list on the page's next regeneration and the page is cached for no longer than the dates' window.
 */
const readPerformances = async (spec: Extract<ListSpec, { source: 'performances' }>, nowIso: string): Promise<ListItem[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({
    collection: 'performances',
    where: { and: [{ startsAt: { less_than: nowIso } }, { or: [{ recordingUrl: { exists: true } }, { video: { exists: true } }] }] },
    depth: 1,
    limit: spec.count,
    sort: '-startsAt',
    overrideAccess: false,
    draft: false,
  })
  return found.docs.map(performanceListItem).filter((i): i is ListItem => i !== null)
}
/**
 * RadioLive's artists, as the old page listed them: those who have played a show that is over, the most recent first, each with how many times and when last ("2 appearances ·
 * Oct. 29, 2026"). An artist only on a coming bill is not yet an artist of RadioLive here. Cached with the dates' window, because "over" depends on the clock.
 */
const readArtists = async (spec: Extract<ListSpec, { source: 'artists' }>, nowIso: string): Promise<ListItem[]> => {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'performances', where: { startsAt: { less_than: nowIso } }, depth: 2, limit: 500, pagination: false, sort: '-startsAt', overrideAccess: false, draft: false })
  const docs = new Map<string, unknown>()
  const played = found.docs.map((p) => ({
    slug: p.slug ?? String(p.id),
    startsAt: p.startsAt,
    lineup: (p.lineup ?? []).flatMap((a) => {
      if (typeof a !== 'object' || a === null || !a.slug) return []
      if (!docs.has(a.slug)) docs.set(a.slug, a)
      return [{ slug: a.slug, name: a.name }]
    }),
  }))
  return appearances(played)
    .slice(0, spec.count)
    .map((a) => artistListItem(docs.get(a.slug), appearanceLine(a)))
    .filter((i): i is ListItem => i !== null)
}
const cachedArtists = unstable_cache(readArtists, ['section-artists'], { revalidate: SECTION_REVALIDATE.dates, tags: [...TAGS, 'section-data:list', 'section-data:dates', 'radiolive'] })
const cachedPerformances = unstable_cache(readPerformances, ['section-performances'], { revalidate: SECTION_REVALIDATE.dates, tags: [...TAGS, 'section-data:list', 'section-data:dates'] })

/** The entries a List shows. An empty list (nothing published, a deleted section) is `[]`. */
export async function loadList(spec: ListSpec): Promise<ListItem[]> {
  if (spec.source === 'performances') return cachedPerformances(spec, await sectionClock())
  if (spec.source === 'artists') return cachedArtists(spec, await sectionClock())
  return cachedList(spec)
}

const readFeatured = async (spec: FeaturedSpec): Promise<FeaturedItem | null> => {
  const payload = await getPayload({ config: configPromise })
  try {
    if (spec.mode === 'newest') {
      const found = await payload.find({ collection: 'posts', where: { section: { equals: spec.sectionId } }, depth: 1, limit: 1, sort: '-publishedAt', overrideAccess: false, draft: false })
      return storyFeatured(found.docs[0])
    }
    if (spec.relationTo === 'productions') {
      return productionFeatured(await payload.findByID({ collection: 'productions', id: spec.id, depth: 0, overrideAccess: false, draft: false }))
    }
    return storyFeatured(await payload.findByID({ collection: 'posts', id: spec.id, depth: 1, overrideAccess: false, draft: false }))
  } catch (e) {
    if (isNotFound(e)) return null // deleted or not published: draw nothing
    throw e
  }
}
const cachedFeatured = unstable_cache(readFeatured, ['section-featured'], { revalidate: SECTION_REVALIDATE.featured, tags: [...TAGS, 'section-data:featured'] })

/** What a Featured record leads with, or null when the record is gone or not published. */
export async function loadFeatured(spec: FeaturedSpec): Promise<FeaturedItem | null> {
  return cachedFeatured(spec)
}

const readDates = async (spec: Exclude<DatesSpec, { source: 'typed' }>, nowIso: string): Promise<DateItem[]> => {
  const now = new Date(nowIso)
  if (spec.source === 'radiolive') {
    const payload = await getPayload({ config: configPromise })
    const from = new Date(now.getTime() - DEFAULT_DURATION_HOURS * 3_600_000).toISOString()
    const found = await payload.find({ collection: 'performances', where: { startsAt: { greater_than_equal: from } }, depth: 0, limit: spec.count * 2, sort: 'startsAt', overrideAccess: false, draft: false })
    return upcomingDates(found.docs.map(performanceDateItem), now, spec.count)
  }
  const calendar = await loadCalendar({}, now)
  const items = calendar.result.days.flatMap((d) =>
    d.entries.map((e): DateItem | null => {
      const startsAt = zonedInstant(e.date, e.start)
      return Number.isNaN(startsAt.getTime())
        ? null
        : { id: `event-${e.event.id}-${e.date}`, title: e.event.title, startsAt: startsAt.toISOString(), endsAt: e.end ? zonedInstant(e.date, e.end).toISOString() : null, place: e.event.venueName, href: e.event.path || null }
    }),
  )
  return upcomingDates(items, now, spec.count)
}
const cachedDates = unstable_cache(readDates, ['section-dates'], { revalidate: SECTION_REVALIDATE.dates, tags: [...TAGS, 'section-data:dates'] })

/** The station's own upcoming dates (RadioLive shows, community events), soonest first. The clock is the cached one, so a past date drops off on the next regeneration. */
export async function loadDates(spec: Exclude<DatesSpec, { source: 'typed' }>): Promise<DateItem[]> {
  return cachedDates(spec, await sectionClock())
}

export interface CreditData {
  lines: AcknowledgmentLine[]
  /** The fellowship's page, only for a fellowship: the panel's link reads "About the fellowship". */
  hubHref: string | null
  independenceHref: string | null
  subject: 'reporting' | 'program'
}

const readCredit = async (spec: CreditSpec, nowIso: string): Promise<CreditData> => {
  const payload = await getPayload({ config: configPromise })
  const lines =
    spec.relationTo === 'fellowships'
      ? await getFellowshipHubAcknowledgments(payload, spec.id, nowIso)
      : spec.relationTo === 'series'
        ? await getSeriesHubAcknowledgments(payload, spec.id, nowIso)
        : await getProductionHubAcknowledgments(payload, spec.id, nowIso)
  if (lines.length === 0) return { lines, hubHref: null, independenceHref: null, subject: 'reporting' }
  let hubHref: string | null = null
  if (spec.relationTo === 'fellowships') {
    const f = await payload.findByID({ collection: 'fellowships', id: spec.id, depth: 0, overrideAccess: false, draft: false }).catch(() => null)
    hubHref = f?.slug && /^[a-z0-9-]+$/.test(f.slug) ? `/fellowships/${f.slug}` : null
  }
  const settings = await getCachedGlobal('site-settings', 1)()
  const policy = settings?.independencePolicy && typeof settings.independencePolicy === 'object' ? settings.independencePolicy : null
  return { lines, hubHref, independenceHref: policy?.slug ? `/${policy.slug}` : null, subject: spec.relationTo === 'productions' ? 'program' : 'reporting' }
}
const cachedCredit = unstable_cache(readCredit, ['section-credit'], { revalidate: SECTION_REVALIDATE.credit, tags: [...TAGS, 'section-data:credit'] })

/**
 * The agreement line for a production, fellowship or series, as the resolver decides it for the clock's date. Agreements are not public
 * records, so this reads them on the server and hands back only the approved lines. A change to an agreement reaches a page holding this
 * block within `SECTION_REVALIDATE.credit` seconds (the agreement's own revalidation names story and hub pages, not pages with a block).
 */
export async function loadCredit(spec: CreditSpec): Promise<CreditData> {
  return cachedCredit(spec, await sectionClock())
}
