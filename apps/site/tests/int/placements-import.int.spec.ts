// @vitest-environment node
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import sharp from 'sharp'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { IMAGE_HOST, importRail, REQUEST_GAP_MS, tileProblem } from '../../scripts/placements/import-rail-core'
import { RAIL_TILES, type RailTileSource } from '../../scripts/placements/rail-tiles'

// The one-time import of the live home page's rail: what it will refuse, that a dry run changes nothing, that it keeps its distance from the
// live site, and that running it twice does no harm. The pictures here are generated; nothing is fetched.

const ctx = { disableRevalidate: true }
let payload: Payload
let png: Buffer

const tile = (over: Partial<RailTileSource> = {}): RailTileSource => ({ kind: 'sponsor', sponsor: 'Acme', imageUrl: `https://${IMAGE_HOST}/dims4/x.png`, alt: 'Acme', href: 'https://acme.example/', enabled: true, ...over })

describe('the rail import rules', () => {
  it('imports only from the picture host the live page uses, over https', () => {
    expect(tileProblem(tile())).toBeNull()
    expect(tileProblem(tile({ imageUrl: 'https://evil.example/x.png' }))).toMatch(/not on/)
    expect(tileProblem(tile({ imageUrl: `http://${IMAGE_HOST}/x.png` }))).toMatch(/not on/)
    expect(tileProblem(tile({ imageUrl: 'not a url' }))).toMatch(/not an address/)
  })
  it('refuses a tile the site would refuse to draw: an unsafe link, no words for the picture, or a sponsor with no name', () => {
    expect(tileProblem(tile({ href: 'javascript:alert(1)' }))).toMatch(/link/)
    expect(tileProblem(tile({ href: 'http://insecure.example/' }))).toMatch(/link/)
    expect(tileProblem(tile({ alt: '  ' }))).toMatch(/words/)
    expect(tileProblem(tile({ alt: 'x'.repeat(161) }))).toMatch(/over 160/)
    expect(tileProblem(tile({ sponsor: '' }))).toMatch(/name/)
    expect(tileProblem(tile({ kind: 'house', sponsor: undefined }))).toBeNull()
  })
  it('keeps a distance from the live site: three seconds between requests', () => {
    expect(REQUEST_GAP_MS).toBeGreaterThanOrEqual(3000)
  })
  it('lists ten tiles that can all be imported, in the live order, with the expired one held', () => {
    expect(RAIL_TILES).toHaveLength(10)
    for (const t of RAIL_TILES) expect(tileProblem(t), t.alt).toBeNull()
    expect(RAIL_TILES.filter((t) => !t.enabled).map((t) => t.sponsor)).toEqual(['Sinfonia Gulf Coast'])
    expect(RAIL_TILES.filter((t) => t.kind === 'sponsor').map((t) => t.sponsor)).toEqual(['Alphastar Wealth Management', 'Emerald Coast Theatre Company', 'Santa Rosa County Tourism Development Office', 'Sinfonia Gulf Coast', 'Boyles & Boyles, PLLC'])
    expect(new Set(RAIL_TILES.map((t) => t.imageUrl)).size).toBe(10)
  })
})

describe('the rail import', () => {
  const run = Date.now().toString(36)
  const fetched: string[] = []
  const slept: number[] = []
  const opts = (over: Record<string, unknown> = {}) => ({
    apply: true,
    fetchImage: async (url: string) => {
      fetched.push(url)
      return { data: png, mimetype: 'image/png' }
    },
    sleep: async (ms: number) => void slept.push(ms),
    ...over,
  })
  // A unique picture address per tile, so reruns of this file never collide with a leftover record.
  const tiles = RAIL_TILES.map((t, i) => ({ ...t, imageUrl: `${t.imageUrl}&test=${run}-${i}` }))
  // The home page rail as placements, in the order they run, with each sponsor's name read back.
  const rail = async () =>
    (await payload.find({ collection: 'placement-items', where: { zone: { equals: 'home.rail' } }, sort: 'order', depth: 1, limit: 50, pagination: false, overrideAccess: true })).docs.map((d) => ({
      kind: d.kind,
      sponsor: typeof d.sponsor === 'object' && d.sponsor ? d.sponsor.name : null,
      enabled: d.enabled,
      href: d.href,
      image: d.image,
      order: d.order,
    }))
  const clearRail = async () => {
    const found = await payload.find({ collection: 'placement-items', where: { zone: { equals: 'home.rail' } }, limit: 50, depth: 0, pagination: false, overrideAccess: true })
    for (const d of found.docs) await payload.delete({ collection: 'placement-items', id: d.id, overrideAccess: true, context: ctx })
  }
  const clearSponsors = async () => {
    const found = await payload.find({ collection: 'sponsors', where: { name: { in: RAIL_TILES.flatMap((t) => (t.sponsor ? [t.sponsor] : [])) } }, limit: 50, depth: 0, pagination: false, overrideAccess: true })
    for (const d of found.docs) await payload.delete({ collection: 'sponsors', id: d.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } }).png().toBuffer()
  }, 60_000)

  // The pictures this file imports (their addresses carry `run`), removed so each test starts without them.
  const clearPictures = async () => {
    const found = await payload.find({ collection: 'media', where: { 'legacy.sourceUrl': { like: run } }, limit: 50, depth: 0, overrideAccess: true })
    for (const m of found.docs) await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  }

  beforeEach(async () => {
    fetched.length = 0
    slept.length = 0
    await clearRail()
    await clearPictures()
  })

  afterAll(async () => {
    await clearRail()
    await clearPictures()
    await clearSponsors()
  })

  it('a dry run lists every tile and fetches and changes nothing', async () => {
    const out = await importRail(payload, tiles, opts({ apply: false }))
    expect(fetched).toEqual([])
    expect(out.reports.map((r) => r.verdict)).toEqual(Array(10).fill('would-import'))
    expect(out.railWritten).toBe(false)
    expect(await rail()).toHaveLength(0)
  })

  it('fetches each picture once, three seconds apart, and fills the rail in the live order with the right kinds', async () => {
    const out = await importRail(payload, tiles, opts())
    expect(fetched).toHaveLength(10)
    expect(slept).toEqual(Array(9).fill(REQUEST_GAP_MS)) // none before the first request
    expect(out.railWritten).toBe(true)
    const rows = await rail()
    expect(rows).toHaveLength(10)
    expect(rows.map((r) => [r.kind, r.sponsor ?? null, r.enabled])).toEqual(RAIL_TILES.map((t) => [t.kind, t.sponsor ?? null, t.enabled]))
    expect(rows.map((r) => r.order)).toEqual(RAIL_TILES.map((_, i) => (i + 1) * 10))
    expect(rows.map((r) => r.href)).toEqual(RAIL_TILES.map((t) => t.href))
    for (const r of rows) expect(r.image).toBeTruthy()
  })

  it('run again, it reuses the pictures it has and makes nothing twice', async () => {
    await importRail(payload, tiles, opts())
    const before = JSON.stringify(await rail())
    fetched.length = 0
    const again = await importRail(payload, tiles, opts())
    expect(fetched).toEqual([])
    expect(again.reports.map((r) => r.verdict)).toEqual(Array(10).fill('reused-picture'))
    expect(again.railWritten).toBe(false) // every placement it would make is already there
    expect(again.railSkippedBecause).toBeNull()
    expect(JSON.stringify(await rail())).toBe(before)
  })

  it('never overwrites a rail made by hand, but does with --replace', async () => {
    const first = await importRail(payload, tiles.slice(0, 1), opts())
    expect(first.railWritten).toBe(true)
    const mine = await importRail(payload, tiles.slice(1, 3), opts())
    expect(mine.railWritten).toBe(false)
    expect(mine.railSkippedBecause).toMatch(/made by hand/)
    expect(await rail()).toHaveLength(1)
    const replaced = await importRail(payload, tiles.slice(1, 3), opts({ replace: true }))
    expect(replaced.railWritten).toBe(true)
    expect(await rail()).toHaveLength(2)
  })

  it('does not half-fill the rail when a picture cannot be fetched, and finishes on the next run', async () => {
    let n = 0
    const failing = opts({ fetchImage: async (url: string) => { fetched.push(url); if (++n === 3) throw new Error('HTTP 503'); return { data: png, mimetype: 'image/png' } } })
    await expect(importRail(payload, tiles, failing)).rejects.toThrow('HTTP 503')
    expect(await rail()).toHaveLength(0)
    fetched.length = 0
    const done = await importRail(payload, tiles, opts())
    expect(done.railWritten).toBe(true)
    expect(fetched).toHaveLength(8) // the two that were kept are not fetched again
  })

  it('refuses a bad tile and reports it, without stopping the others', async () => {
    const out = await importRail(payload, [tiles[0]!, { ...tiles[1]!, href: 'javascript:alert(1)' }, tiles[2]!], opts())
    expect(out.reports.map((r) => r.verdict)).toEqual(['imported', 'refused', 'imported'])
    expect(await rail()).toHaveLength(2)
  })
})
