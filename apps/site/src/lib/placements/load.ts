import configPromise from '@payload-config'
import { unstable_cache } from 'next/cache'
import { getPayload } from 'payload'

import type { Media, PlacementItem } from '@/payload-types'
import { cacheGeneration } from '@/utilities/getGlobals'

import { resolveZone, type PageContext, type PlacementRecord } from './resolve'
import type { PlacementTile } from './tiles'

export interface HomePlacements {
  rail: PlacementTile<Media>[]
  band: PlacementTile<Media> | null
}

const NONE: HomePlacements = { rail: [], band: null }
const MAX_RECORDS = 200

/** The record the resolver reads, from a stored placement whose sponsor's name has been looked up. */
export function toRecord(doc: PlacementItem, sponsorNames: ReadonlyMap<string, string>): PlacementRecord<Media> {
  const sponsorId = doc.sponsor == null ? null : String(typeof doc.sponsor === 'object' ? doc.sponsor.id : doc.sponsor)
  return {
    id: doc.id,
    zone: doc.zone,
    kind: doc.kind,
    sponsor: sponsorId ? (sponsorNames.get(sponsorId) ?? null) : null,
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
    return { rail: resolveZone('home.rail', ctx, records, now), band: resolveZone('home.band', ctx, records, now)[0] ?? null }
  } catch (err) {
    await logFailure(err)
    return NONE
  }
}

/** The rail beside a section, topic, reporter or all-stories page: the placements aimed at this page. Empty on any failure. */
export async function loadListRail(ctx: Extract<PageContext, { page: 'list' }>, now: Date = new Date()): Promise<PlacementTile<Media>[]> {
  try {
    return resolveZone('list.rail', ctx, await readRecords(), now)
  } catch (err) {
    await logFailure(err)
    return []
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
