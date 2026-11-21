// @vitest-environment node
import path from 'node:path'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readPlacementRecords } from '@/lib/placements/load'
import { resolveZone } from '@/lib/placements/resolve'
import { storyPage } from '@/lib/placements/story'
import { DEMO } from '../../scripts/staging-demo/seed-placements-core'
import { seedSponsorZonesDemo } from '../../scripts/staging-demo/seed-sponsor-zones-core'

// The demonstration content for the top units, the story zones, the site banner and the home page of blocks: that a dry run writes nothing, that a run makes what it says
// and aims it as described, that a second run makes nothing, and that it never changes a banner or a page that is already there.

const assetDir = path.resolve(__dirname, '../../scripts/staging-demo/assets')
const ctx = { disableRevalidate: true, disableEmbedding: true }
const NOW = new Date()
let payload: Payload
const madeHere: { collection: 'sections'; id: number | string }[] = []
let savedBanner: Record<string, unknown>
// The seed writes a home page only where there is none; a database that already has one keeps it, and the test must not delete it.
let homeExisted = false
const homeCount = async () => (await payload.find({ collection: 'pages', where: { slug: { equals: 'home' } }, limit: 1, depth: 0, overrideAccess: true, draft: true })).totalDocs

const clean = async () => {
  for (const collection of ['placement-items', 'sponsors'] as const) {
    const found = await payload.find({ collection, where: { name: { like: collection === 'sponsors' ? 'Example Sponsor' : DEMO } } as never, limit: 100, depth: 0, pagination: false, overrideAccess: true })
    for (const d of found.docs) await payload.delete({ collection, id: d.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  }
  const media = await payload.find({ collection: 'media', where: { 'legacy.sourceUrl': { like: 'demonstration:' } }, limit: 20, depth: 0, pagination: false, overrideAccess: true })
  for (const m of media.docs) await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  if (!homeExisted) {
    const pages = await payload.find({ collection: 'pages', where: { slug: { equals: 'home' } }, limit: 5, depth: 0, overrideAccess: true, draft: true })
    for (const p of pages.docs) await payload.delete({ collection: 'pages', id: p.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  }
}
const section = async (slug: string) => {
  const found = await payload.find({ collection: 'sections', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return found.docs[0]
  const doc = await payload.create({ collection: 'sections', data: { title: slug, slug } as never, overrideAccess: true, context: ctx })
  madeHere.push({ collection: 'sections', id: doc.id })
  return doc
}

describe('the staging demonstration for the top units and story zones', () => {
  let campus: { id: number | string }
  let localNews: { id: number | string }
  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    campus = await section('campus')
    localNews = await section('local-news')
    homeExisted = (await homeCount()) > 0
    savedBanner = (await payload.findGlobal({ slug: 'site-banner', depth: 0, overrideAccess: true })) as unknown as Record<string, unknown>
    await payload.updateGlobal({ slug: 'site-banner', data: { active: false, headline: null } as never, overrideAccess: true, context: ctx })
    await clean()
  }, 90_000)
  afterAll(async () => {
    await clean()
    await payload.updateGlobal({ slug: 'site-banner', data: { active: false, scope: 'home', style: 'emergency', label: null, headline: null, body: null, linkLabel: null, linkHref: null, ...(savedBanner.active ? savedBanner : {}) } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of madeHere) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('a dry run says what it would make and writes nothing', async () => {
    const report = await seedSponsorZonesDemo(payload, { apply: false, assetDir })
    expect(report.made.length).toBeGreaterThan(8)
    expect((await payload.find({ collection: 'placement-items', where: { name: { like: DEMO } } as never, limit: 5, depth: 0, overrideAccess: true })).totalDocs).toBe(0)
    expect(await homeCount()).toBe(homeExisted ? 1 : 0)
  }, 90_000)

  it('a run makes the placements, aimed where described, the notice banner and, where there is none, the home page', async () => {
    const report = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(report.skipped).toEqual([])
    const records = await readPlacementRecords()
    expect(resolveZone('home.top', { page: 'home' }, records, NOW)).toHaveLength(1)
    for (const s of [campus, localNews]) {
      expect(resolveZone('list.top', { page: 'list', kind: 'section', id: s.id }, records, NOW), 'list.top').toHaveLength(1)
      const story = storyPage({ section: s.id })
      expect(resolveZone('story.inline', story, records, NOW).map((t) => t.key), 'story.inline').toEqual(['story.inline.1', 'story.inline.2'])
    }
    const other = await section('somewhere-else')
    expect(resolveZone('list.top', { page: 'list', kind: 'section', id: other.id }, records, NOW)).toEqual([])
    expect(resolveZone('story.inline', storyPage({ section: other.id }), records, NOW)).toEqual([])
    const banner = (await payload.findGlobal({ slug: 'site-banner', depth: 0, overrideAccess: true })) as unknown as { active: boolean; style: string; scope: string }
    expect(banner).toMatchObject({ active: true, style: 'notice', scope: 'home' })
    const page = await payload.find({ collection: 'pages', where: { slug: { equals: 'home' } }, limit: 1, depth: 0, overrideAccess: true })
    expect(page.docs[0]).toMatchObject({ pageSet: 'home', template: 'sections' })
    if (!homeExisted) expect(page.docs[0]).toMatchObject({ noindex: false, _status: 'published' })
  }, 120_000)

  it('run again, it makes nothing twice', async () => {
    const again = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(again.made).toEqual([])
    expect(again.kept.length).toBeGreaterThan(8)
  }, 90_000)

  it('puts the current top-unit picture on a demonstration top unit made with an older one, and then makes nothing', async () => {
    const tile = await payload.find({ collection: 'media', where: { 'legacy.sourceUrl': { equals: 'demonstration:demo-sponsor-tile.png' } }, limit: 1, depth: 0, overrideAccess: true })
    const placement = await payload.find({ collection: 'placement-items', where: { name: { equals: `${DEMO}: example sponsor, home page top unit` } }, limit: 1, depth: 0, overrideAccess: true })
    await payload.update({ collection: 'placement-items', id: placement.docs[0]!.id, data: { image: tile.docs[0]!.id } as never, overrideAccess: true, context: ctx })
    const fixed = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(fixed.made.filter((l) => l.includes('picture replaced'))).toHaveLength(1)
    const after = await payload.findByID({ collection: 'placement-items', id: placement.docs[0]!.id, depth: 1, overrideAccess: true })
    expect((after.image as { filename?: string }).filename).toMatch(/^demo-sponsor-top-wide(-\d+)?\.png$/)
    expect((await seedSponsorZonesDemo(payload, { apply: true, assetDir })).made).toEqual([])
  }, 90_000)

  it('never changes a banner an editor has set', async () => {
    await payload.updateGlobal({ slug: 'site-banner', data: { active: true, scope: 'all', style: 'emergency', headline: 'Shelters open at noon' } as never, overrideAccess: true, context: ctx })
    const report = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(report.kept.some((l) => l.startsWith('site banner'))).toBe(true)
    const banner = (await payload.findGlobal({ slug: 'site-banner', depth: 0, overrideAccess: true })) as unknown as { headline: string; style: string }
    expect(banner).toMatchObject({ headline: 'Shelters open at noon', style: 'emergency' })
  }, 90_000)
})
