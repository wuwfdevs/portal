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
let savedBanner: unknown

const clean = async () => {
  for (const collection of ['placement-items', 'sponsors'] as const) {
    const found = await payload.find({ collection, where: { name: { like: collection === 'sponsors' ? 'Example Sponsor' : DEMO } } as never, limit: 100, depth: 0, pagination: false, overrideAccess: true })
    for (const d of found.docs) await payload.delete({ collection, id: d.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  }
  const media = await payload.find({ collection: 'media', where: { 'legacy.sourceUrl': { like: 'demonstration:' } }, limit: 20, depth: 0, pagination: false, overrideAccess: true })
  for (const m of media.docs) await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  const pages = await payload.find({ collection: 'pages', where: { slug: { equals: 'home-blocks' } }, limit: 5, depth: 0, overrideAccess: true, draft: true })
  for (const p of pages.docs) await payload.delete({ collection: 'pages', id: p.id, overrideAccess: true, context: ctx }).catch(() => undefined)
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
    savedBanner = ((await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })) as unknown as { banner?: unknown }).banner
    await payload.updateGlobal({ slug: 'homepage', data: { banner: { active: false, headline: null } } as never, overrideAccess: true, context: ctx })
    await clean()
  }, 90_000)
  afterAll(async () => {
    await clean()
    await payload.updateGlobal({ slug: 'homepage', data: { banner: savedBanner ?? { active: false } } as never, overrideAccess: true, context: ctx }).catch(() => undefined)
    for (const { collection, id } of madeHere) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })

  it('a dry run says what it would make and writes nothing', async () => {
    const report = await seedSponsorZonesDemo(payload, { apply: false, assetDir })
    expect(report.made.length).toBeGreaterThan(8)
    expect((await payload.find({ collection: 'placement-items', where: { name: { like: DEMO } } as never, limit: 5, depth: 0, overrideAccess: true })).totalDocs).toBe(0)
    expect((await payload.find({ collection: 'pages', where: { slug: { equals: 'home-blocks' } }, limit: 1, depth: 0, overrideAccess: true, draft: true })).totalDocs).toBe(0)
  }, 90_000)

  it('a run makes the placements, aimed where described, the notice banner and the home page of blocks', async () => {
    const report = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(report.skipped).toEqual([])
    const records = await readPlacementRecords()
    expect(resolveZone('home.top', { page: 'home' }, records, NOW)).toHaveLength(1)
    for (const s of [campus, localNews]) {
      expect(resolveZone('list.top', { page: 'list', kind: 'section', id: s.id }, records, NOW), 'list.top').toHaveLength(1)
      const story = storyPage({ section: s.id })
      expect(resolveZone('story.rail', story, records, NOW), 'story.rail').toHaveLength(1)
      expect(resolveZone('story.inline', story, records, NOW), 'story.inline').toHaveLength(1)
    }
    const other = await section('somewhere-else')
    expect(resolveZone('list.top', { page: 'list', kind: 'section', id: other.id }, records, NOW)).toEqual([])
    expect(resolveZone('story.rail', storyPage({ section: other.id }), records, NOW)).toEqual([])
    const home = (await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })) as unknown as { banner: { active: boolean; style: string; scope: string } }
    expect(home.banner).toMatchObject({ active: true, style: 'notice', scope: 'home' })
    const page = await payload.find({ collection: 'pages', where: { slug: { equals: 'home-blocks' } }, limit: 1, depth: 0, overrideAccess: true })
    expect(page.docs[0]).toMatchObject({ pageSet: 'home', template: 'sections', noindex: true, _status: 'published' })
  }, 120_000)

  it('run again, it makes nothing twice', async () => {
    const again = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(again.made).toEqual([])
    expect(again.kept.length).toBeGreaterThan(8)
  }, 90_000)

  it('never changes a banner an editor has set', async () => {
    await payload.updateGlobal({ slug: 'homepage', data: { banner: { active: true, scope: 'all', style: 'emergency', headline: 'Shelters open at noon' } } as never, overrideAccess: true, context: ctx })
    const report = await seedSponsorZonesDemo(payload, { apply: true, assetDir })
    expect(report.kept.some((l) => l.startsWith('site banner'))).toBe(true)
    const home = (await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })) as unknown as { banner: { headline: string; style: string } }
    expect(home.banner).toMatchObject({ headline: 'Shelters open at noon', style: 'emergency' })
  }, 90_000)
})
