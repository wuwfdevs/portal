import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { KnownPlacement } from '@/lib/analytics/tally'
import type { Media, PlacementItem } from '@/payload-types'
import { cacheGeneration } from '@/utilities/getGlobals'

import { storyZonesAllowed, type StoryExclusionFields } from './exclusions'
import { resolveFillers, resolveZone, type PageContext, type PlacementRecord } from './resolve'
import { storyPage } from './story'
import type { PlacementTile } from './tiles'

export interface HomePlacements {
  /** The home page's top unit (`home.top`), one sponsor for a stretch of dates. The page holds it back while an emergency banner is on. */
  top: PlacementTile<Media> | null
  rail: PlacementTile<Media>[]
  /** WUWF promotions that may complete the foot row (`flow.ts`). Optional: usually empty. */
  fillers: PlacementTile<Media>[]
}

const NONE: HomePlacements = { top: null, rail: [], fillers: [] }
const MAX_RECORDS = 200

/** The record the resolver reads, from a stored placement whose sponsor's name has been looked up. */
export function toRecord(doc: PlacementItem, sponsorNames: ReadonlyMap<string, string>): PlacementRecord<Media> {
  const sponsorId = doc.sponsor == null ? null : String(typeof doc.sponsor === 'object' ? doc.sponsor.id : doc.sponsor)
  return {
    id: doc.id,
    zone: doc.zone,
    kind: doc.kind,
    sponsor: sponsorId ? (sponsorNames.get(sponsorId) ?? null) : null,
    sponsorId,
    enabled: doc.enabled,
    runFrom: doc.runFrom,
    runUntil: doc.runUntil,
    href: doc.href,
    alt: doc.alt,
    image: doc.image,
    phoneImage: doc.phoneImage,
    order: doc.order,
    createdAt: doc.createdAt,
    scope: doc.scope,
    sections: doc.sections,
    topics: doc.topics,
    people: doc.people,
    includeLatest: doc.includeLatest,
    fillsGaps: doc.fillsGaps,
  }
}

/**
 * Every placement that is switched on, read once and cached under the `placements` tag (saving, deleting or switching one in the admin
 * refreshes it, and a new deployment reads it fresh). Dates and pages are decided when a page is drawn, not here, so a tile ends on its last
 * day when the page next refreshes (the home page within five minutes, a list page within the hour).
 *
 * Read through access control (`overrideAccess: false`: the public reads only what is switched on). A sponsor's name comes from the
 * Sponsors collection, which the public cannot read, so only the name is fetched on the server and only that goes into the record.
 */
export async function readPlacementRecords(): Promise<PlacementRecord<Media>[]> {
  const payload = await getPayload({ config: configPromise })
  const found = await payload.find({ collection: 'placement-items', where: { enabled: { equals: true } }, depth: 1, limit: MAX_RECORDS, pagination: false, overrideAccess: false })
  const sponsorIds = [...new Set(found.docs.flatMap((d) => (d.sponsor == null ? [] : [typeof d.sponsor === 'object' ? d.sponsor.id : d.sponsor])))]
  const names = new Map<string, string>()
  if (sponsorIds.length > 0) {
    const sponsors = await payload.find({ collection: 'sponsors', where: { id: { in: sponsorIds } }, depth: 0, limit: sponsorIds.length, pagination: false, overrideAccess: true, select: { name: true } })
    for (const s of sponsors.docs) names.set(String(s.id), s.name)
  }
  return found.docs.map((d) => toRecord(d, names))
}

const readRecords = unstable_cache(readPlacementRecords, ['placement-items', cacheGeneration()], { tags: ['placements'] })

/** What fills the home page's rail and banner today. A failed read leaves the placements out and the news up. */
export async function loadHomePlacements(now: Date = new Date()): Promise<HomePlacements> {
  try {
    const records = await readRecords()
    const ctx: PageContext = { page: 'home' }
    return { top: resolveZone('home.top', ctx, records, now)[0] ?? null, rail: resolveZone('home.rail', ctx, records, now), fillers: resolveFillers(records, now) }
  } catch (err) {
    await logFailure(err)
    return NONE
  }
}

export interface ListPlacements {
  /** The top unit under the page's title (`list.top`): a section's presenting sponsor. One, aimed at this page. */
  top: PlacementTile<Media> | null
  /** The rail beside the stories (`list.rail`). */
  rail: PlacementTile<Media>[]
}

/** What fills a section, topic, reporter or all-stories page: the placements aimed at this page. Empty on any failure, so the page draws without them. */
export async function loadListPlacements(ctx: Extract<PageContext, { page: 'list' }>, now: Date = new Date()): Promise<ListPlacements> {
  try {
    const records = await readRecords()
    return { top: resolveZone('list.top', ctx, records, now)[0] ?? null, rail: resolveZone('list.rail', ctx, records, now) }
  } catch (err) {
    await logFailure(err)
    return { top: null, rail: [] }
  }
}

export interface StoryPlacements {
  /** The bands inside the story (`story.inline`): the first after its opening paragraphs and, in a long story, a second. At most two, in run order. */
  inline: PlacementTile<Media>[]
}

const NO_STORY_PLACEMENTS: StoryPlacements = { inline: [] }

/**
 * What a story page carries: the bands aimed at the sections, topics or reporters it is filed under. A live blog, a members-only story and one an editor ticked carry none
 * (`storyZonesAllowed`), and a failed read leaves them out so the story still draws.
 */
export async function loadStoryPlacements(story: Parameters<typeof storyPage>[0] & StoryExclusionFields, now: Date = new Date()): Promise<StoryPlacements> {
  if (!storyZonesAllowed(story)) return NO_STORY_PLACEMENTS
  try {
    return { inline: resolveZone('story.inline', storyPage(story), await readRecords(), now) }
  } catch (err) {
    await logFailure(err)
    return NO_STORY_PLACEMENTS
  }
}

async function logFailure(err: unknown): Promise<void> {
  try {
    const payload = await getPayload({ config: configPromise })
    payload.logger.error({ err, msg: 'Placements could not be loaded and are left out of the page' })
  } catch {
    // Nothing more can be done: the page draws without placements.
  }
}

/**
 * Every switched-on placement by id, as the placement counter needs it (`app/api/placement-counts`): its zone, kind and sponsor, from the record,
 * so a count never takes them from the browser. Read through the same cache as the pages.
 */
export async function knownPlacements(): Promise<Map<string, KnownPlacement>> {
  const records = await readRecords()
  const known = new Map<string, KnownPlacement>()
  for (const r of records) {
    if (r.id == null || typeof r.zone !== 'string') continue
    const kind = r.kind === 'house' ? 'house' : 'sponsor'
    known.set(String(r.id), { id: String(r.id), zone: r.zone, kind, sponsorId: kind === 'sponsor' ? (r.sponsorId ?? null) : null })
  }
  return known
}
