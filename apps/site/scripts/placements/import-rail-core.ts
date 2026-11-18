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

/**
 * Puts the tiles in the media library (one record per source picture, found again by its address on a second run) and then in the rail.
 * Nothing is written without `apply`. A rail that already has tiles is left alone unless `replace`.
 */
export async function importRail(payload: Payload, tiles: readonly RailTileSource[], opts: ImportOptions): Promise<{ reports: TileReport[]; railWritten: boolean; railSkippedBecause: string | null }> {
  const log = opts.log ?? (() => undefined)
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const reports: TileReport[] = []
  const rows: Record<string, unknown>[] = []

  const current = await payload.findGlobal({ slug: 'placements', depth: 0, overrideAccess: true })
  const filled = (current.homeRail?.length ?? 0) > 0
  const skipRail = filled && !opts.replace ? 'the rail already has tiles (use --replace to replace them)' : null
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
    if (mediaId !== null) rows.push({ kind: t.kind, ...(t.kind === 'sponsor' ? { sponsor: t.sponsor } : {}), image: mediaId, alt: t.alt, href: t.href, enabled: t.enabled })
  }

  let railWritten = false
  if (opts.apply && !skipRail && rows.length > 0) {
    await payload.updateGlobal({ slug: 'placements', data: { homeRail: rows } as never, overrideAccess: true, context: { disableRevalidate: true } })
    railWritten = true
  }
  return { reports, railWritten, railSkippedBecause: skipRail }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'tile'
