// Copies the live home page's rail tiles into the Placements global. The rules are here, testable without a network or a database;
// `import-rail.ts` is the command that runs them.
//
// What it will not do: fetch from any host but the one the live page's pictures come from; fetch faster than one request every three
// seconds; send anything but a neutral client name (no contact details of any kind); overwrite a rail an editor has already filled (unless
// `replace`); or import a tile whose address the site would refuse to draw.

import type { Payload } from 'payload'

import { TILE_ALT_MAX } from '../../src/lib/placements/registry'
import { supportHref } from '../../src/lib/support-link'
import type { RailTileSource } from './rail-tiles'

export const IMAGE_HOST = 'npr.brightspotcdn.com'
export const REQUEST_GAP_MS = 3000
/** Neutral, and with no contact information of any kind (CLAUDE.md, "Migrating from Grove"). */
export const USER_AGENT = 'Mozilla/5.0 (compatible; site-migration)'
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MIME: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

/** Why a tile cannot be imported, or null. */
export function tileProblem(t: RailTileSource): string | null {
  let url: URL
  try {
    url = new URL(t.imageUrl)
  } catch {
    return 'its picture address is not an address'
  }
  if (url.protocol !== 'https:' || url.hostname !== IMAGE_HOST) return `its picture is not on ${IMAGE_HOST}`
  if (supportHref(t.href) === null) return 'its link is not a page on this site or a secure https address'
  if (!t.alt.trim()) return 'it has no words for the picture'
  if (t.alt.length > TILE_ALT_MAX) return `its words for the picture are over ${TILE_ALT_MAX} characters (${t.alt.length})`
  if (t.kind === 'sponsor' && !t.sponsor?.trim()) return 'a sponsor tile needs the sponsor\'s name'
  return null
}

export type TileVerdict = 'imported' | 'would-import' | 'reused-picture' | 'refused'

export interface TileReport {
  position: number
  kind: RailTileSource['kind']
  name: string
  verdict: TileVerdict
  detail?: string
}

export interface ImportOptions {
  apply: boolean
  /** Replace a rail an editor has already filled. */
  replace?: boolean
  log?: (line: string) => void
  /** Fetches a picture. Injected so tests need no network; the command passes `fetchPicture`. */
  fetchImage: (url: string) => Promise<{ data: Buffer; mimetype: string }>
  sleep?: (ms: number) => Promise<void>
}

const nameOf = (t: RailTileSource) => t.name?.trim() || t.sponsor?.trim() || t.alt.slice(0, 40)

/** The real fetch: one picture over https, with the neutral client name, a time limit and a size limit. */
export async function fetchPicture(url: string): Promise<{ data: Buffer; mimetype: string }> {
  const res = await fetch(url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(30_000), redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const mimetype = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()
  if (!MIME[mimetype]) throw new Error(`not a picture type we keep (${mimetype || 'no type'})`)
  const data = Buffer.from(await res.arrayBuffer())
  if (data.length > MAX_IMAGE_BYTES) throw new Error('larger than 5 MB')
  return { data, mimetype }
}

/** The name each imported placement is given, so a second run finds it again and a rail made by hand is told apart from this import's. */
export const placementName = (t: RailTileSource): string => `${nameOf(t)}: home page rail (imported from the live site)`

/**
 * Puts the tiles in the media library (one record per source picture, found again by its address on a second run), finds or makes each
 * sponsor, and makes one placement per tile in the home page rail. Nothing is written without `apply`. A rail an editor has made by hand
 * (any placement in the zone this import did not make) is left alone unless `replace`, which clears the zone first. A placement the import
 * already made is not made twice, so a run that stopped part way is finished by running it again.
 */
export async function importRail(payload: Payload, tiles: readonly RailTileSource[], opts: ImportOptions): Promise<{ reports: TileReport[]; railWritten: boolean; railSkippedBecause: string | null }> {
  const log = opts.log ?? (() => undefined)
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const reports: TileReport[] = []
  const planned: { tile: RailTileSource; mediaId: string | number; index: number }[] = []

  const inZone = await payload.find({ collection: 'placement-items', where: { zone: { equals: 'home.rail' } }, depth: 0, limit: 200, pagination: false, overrideAccess: true, select: { name: true } })
  const mine = new Set(tiles.map(placementName))
  const byHand = inZone.docs.filter((d) => !mine.has(d.name))
  const skipRail = byHand.length > 0 && !opts.replace ? 'the rail already has placements made by hand (use --replace to clear it first)' : null
  if (skipRail) log(`note: ${skipRail}; pictures will still be copied, the rail will not be changed`)

  let fetched = false
  for (const [i, t] of tiles.entries()) {
    const base = { position: i + 1, kind: t.kind, name: nameOf(t) }
    const problem = tileProblem(t)
    if (problem) {
      reports.push({ ...base, verdict: 'refused', detail: problem })
      log(`${String(i + 1).padStart(2)}. REFUSED  ${base.name}: ${problem}`)
      continue
    }
    const existing = await payload.find({ collection: 'media', where: { 'legacy.sourceUrl': { equals: t.imageUrl } }, limit: 1, depth: 0, overrideAccess: true })
    let mediaId: string | number | null = existing.docs[0]?.id ?? null
    const verdict: TileVerdict = mediaId !== null ? 'reused-picture' : opts.apply ? 'imported' : 'would-import'
    if (mediaId === null && opts.apply) {
      if (fetched) await sleep(REQUEST_GAP_MS)
      fetched = true
      const { data, mimetype } = await opts.fetchImage(t.imageUrl)
      const doc = await payload.create({
        collection: 'media',
        overrideAccess: true,
        context: { disableRevalidate: true },
        file: { data, mimetype, name: `home-rail-${String(i + 1).padStart(2, '0')}-${slug(nameOf(t))}.${MIME[mimetype] ?? 'png'}`, size: data.length },
        data: {
          alt: t.alt,
          source: 'Copied from the live wuwf.org home page rail, 2026-11-18. Supplied by the sponsor or by WUWF.',
          legacy: { sourceUrl: t.imageUrl },
        } as never,
      })
      mediaId = doc.id
    }
    reports.push({ ...base, verdict, ...(t.note ? { detail: t.note } : {}) })
    log(`${String(i + 1).padStart(2)}. ${verdict.toUpperCase().padEnd(14)} ${t.kind.padEnd(7)} ${base.name}${t.enabled ? '' : '  (held, not shown)'}${t.note ? `\n      ${t.note}` : ''}`)
    if (mediaId !== null) planned.push({ tile: t, mediaId, index: i })
  }

  let created = 0
  if (opts.apply && !skipRail && planned.length > 0) {
    if (opts.replace) {
      for (const d of inZone.docs) await payload.delete({ collection: 'placement-items', id: d.id, overrideAccess: true, context: { disableRevalidate: true } })
    }
    const have = new Set(opts.replace ? [] : inZone.docs.map((d) => d.name))
    for (const { tile: t, mediaId, index } of planned) {
      const name = placementName(t)
      if (have.has(name)) continue
      let sponsorId: string | number | undefined
      if (t.kind === 'sponsor') {
        const sponsorName = t.sponsor!.trim()
        const found = await payload.find({ collection: 'sponsors', where: { name: { equals: sponsorName } }, limit: 1, depth: 0, overrideAccess: true })
        sponsorId = found.docs[0]?.id ?? (await payload.create({ collection: 'sponsors', data: { name: sponsorName } as never, overrideAccess: true, context: { disableRevalidate: true } })).id
      }
      await payload.create({
        collection: 'placement-items',
        overrideAccess: true,
        context: { disableRevalidate: true },
        data: { name, kind: t.kind, ...(sponsorId !== undefined ? { sponsor: sponsorId } : {}), zone: 'home.rail', order: (index + 1) * 10, image: mediaId, alt: t.alt, href: t.href, enabled: t.enabled } as never,
      })
      created++
    }
  }
  return { reports, railWritten: created > 0, railSkippedBecause: skipRail }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tile'
