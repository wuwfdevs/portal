// @vitest-environment node
import path from 'node:path'
import { getPayload, type Payload } from 'payload'
import config from '@/payload.config'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { readPlacementRecords } from '@/lib/placements/load'
import { resolveZone, type PageContext } from '@/lib/placements/resolve'
import { DEMO, FLORIDA_STORIES, seedPlacementsDemo } from '../../scripts/staging-demo/seed-placements-core'

// The demonstration content for staging: that a dry run writes nothing, that a run makes what it says and aims it as described, that a second
// run makes nothing, and that it never changes what an editor has set.

const assetDir = path.resolve(__dirname, '../../scripts/staging-demo/assets')
const ctx = { disableRevalidate: true, disableEmbedding: true }
const NOW = new Date()
let payload: Payload
const madeHere: { collection: 'sections' | 'contributors' | 'categories' | 'placement-items' | 'media'; id: number | string }[] = []
let savedModules: unknown

const cleanDemo = async () => {
  for (const collection of ['placement-items', 'posts', 'sponsors'] as const) {
    const field = collection === 'sponsors' ? 'name' : collection === 'posts' ? 'title' : 'name'
    const found = await payload.find({ collection, where: { [field]: { like: collection === 'sponsors' ? 'Example Sponsor' : DEMO } } as never, limit: 100, depth: 0, pagination: false, overrideAccess: true })
    for (const d of found.docs) await payload.delete({ collection, id: d.id, overrideAccess: true, context: ctx }).catch(() => undefined)
  }
  const media = await payload.find({ collection: 'media', where: { 'legacy.sourceUrl': { like: 'demonstration:' } }, limit: 20, depth: 0, pagination: false, overrideAccess: true })
  for (const m of media.docs) await payload.delete({ collection: 'media', id: m.id, overrideAccess: true, context: ctx }).catch(() => undefined)
}
const slugOf = async (collection: 'sections' | 'contributors' | 'categories', slug: string, data: Record<string, unknown>) => {
  const found = await payload.find({ collection, where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
  if (found.docs[0]) return found.docs[0]
  const doc = await payload.create({ collection, data: data as never, overrideAccess: true, context: ctx })
  madeHere.push({ collection, id: doc.id })
  return doc
}
const list = (kind: 'section' | 'topic' | 'person' | 'latest', id: number | string | null): PageContext => ({ page: 'list', kind, id })

describe('the staging demonstration for news sections and placements', () => {
  let sections: Record<string, { id: number | string }>
  let reporter: { id: number | string }
  let topic: { id: number | string }

  beforeAll(async () => {
    payload = await getPayload({ config: await config })
    savedModules = ((await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })).newsModules ?? []).map((m) => ({ heading: m.heading, section: typeof m.section === 'object' && m.section ? m.section.id : m.section, count: m.count, enabled: m.enabled }))
    await cleanDemo()
    sections = {}
    for (const [slug, title] of [['local-news', 'Local News'], ['local-politics', 'Local Politics'], ['local-arts', 'Local Arts'], ['commentary', 'Commentary'], ['uwf-news', 'UWF News']] as const) sections[slug] = await slugOf('sections', slug, { title, slug })
    reporter = await slugOf('contributors', 'dave-dunwoody', { name: 'Dave Dunwoody', slug: 'dave-dunwoody' })
    topic = await slugOf('categories', 'city-of-pensacola', { title: 'City of Pensacola', slug: 'city-of-pensacola' })
    // WUWF's own promotions the demonstration borrows: the home rail already holds them (as after the import of the live rail).
    const data = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#336699' } }).png().toBuffer()
    const img = await payload.create({ collection: 'media', overrideAccess: true, context: ctx, file: { data, mimetype: 'image/png', name: `seed-own-${Date.now().toString(36)}.png`, size: data.length }, data: { alt: 'own' } as never })
    madeHere.push({ collection: 'media', id: img.id })
    for (const name of ['WUWF app', 'Book Club', 'Protect My Public Media']) {
      const p = await payload.create({ collection: 'placement-items', overrideAccess: true, context: ctx, data: { name: `${name}: home page rail (test)`, kind: 'house', zone: 'home.rail', image: img.id, alt: `${name} words`, href: `https://example.org/${name.replace(/\W+/g, '-')}`, order: 900 } as never })
      madeHere.push({ collection: 'placement-items', id: p.id })
    }
    await payload.updateGlobal({ slug: 'homepage', data: { newsModules: [] } as never, overrideAccess: true, context: ctx })
  }, 90_000)

  afterAll(async () => {
    await cleanDemo()
    await payload.updateGlobal({ slug: 'homepage', data: { newsModules: savedModules } as never, overrideAccess: true, context: ctx })
    for (const { collection, id } of [...madeHere].reverse()) await payload.delete({ collection, id, overrideAccess: true, context: ctx }).catch(() => undefined)
    const fl = await payload.find({ collection: 'sections', where: { slug: { equals: 'florida-news' } }, limit: 1, depth: 0, overrideAccess: true })
    if (fl.docs[0] && madeFlorida) await payload.delete({ collection: 'sections', id: fl.docs[0].id, overrideAccess: true, context: ctx }).catch(() => undefined)
  })
  let madeFlorida = false
  const count = async (collection: 'placement-items' | 'posts' | 'sponsors') => (await payload.find({ collection, where: { [collection === 'sponsors' ? 'name' : collection === 'posts' ? 'title' : 'name']: { like: collection === 'sponsors' ? 'Example Sponsor' : DEMO } } as never, limit: 100, depth: 0, pagination: false, overrideAccess: true })).totalDocs

  it('a dry run says what it would make and writes nothing', async () => {
    const report = await seedPlacementsDemo(payload, { apply: false, assetDir, now: NOW })
    expect(report.made.length).toBeGreaterThan(10)
    expect([await count('placement-items'), await count('posts'), await count('sponsors')]).toEqual([0, 0, 0])
    const home = await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })
    expect(home.newsModules ?? []).toHaveLength(0)
  })

  it('makes the partner section and stories, the news sections, the banner and the aimed placements', async () => {
    madeFlorida = !(await payload.find({ collection: 'sections', where: { slug: { equals: 'florida-news' } }, limit: 1, depth: 0, overrideAccess: true })).docs[0]
    const report = await seedPlacementsDemo(payload, { apply: true, assetDir, now: NOW })
    expect(report.skipped).toEqual([])
    const stories = await payload.find({ collection: 'posts', where: { title: { like: DEMO } }, limit: 20, depth: 0, overrideAccess: true })
    expect(stories.docs).toHaveLength(FLORIDA_STORIES.length)
    expect(stories.docs.every((s) => s.source === 'wire' && s._status === 'published')).toBe(true)
    const home = await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })
    expect((home.newsModules ?? []).map((m) => m.heading)).toEqual(['Local News', 'Local Politics', 'Local Arts', 'Florida News', 'UWF News'])
    expect(await count('sponsors')).toBe(1)
  })

  it('aims each placement where it says: one section, several, a reporter and a topic, the all-stories page and every page', async () => {
    const records = await readPlacementRecords()
    const names = (ctxPage: PageContext) => resolveZone('list.rail', ctxPage, records, NOW).map((t) => [t.key, t.label ? 'sponsor' : 'house'])
    // Local News: the example sponsor (10), then the app promo for every page (50).
    expect(names(list('section', sections['local-news']!.id))).toEqual([['list.rail.1', 'sponsor'], ['list.rail.2', 'house']])
    // Local Arts and Commentary: the Book Club (30), then the app (50).
    expect(names(list('section', sections['local-arts']!.id))).toEqual([['list.rail.1', 'house'], ['list.rail.2', 'house']])
    expect(names(list('section', sections['commentary']!.id))).toHaveLength(2)
    // A section nothing was aimed at: only the every-page promo.
    expect(names(list('section', sections['uwf-news']!.id))).toEqual([['list.rail.1', 'house']])
    // The reporter and the topic: Protect My Public Media (40), then the app (50).
    expect(names(list('person', reporter.id))).toHaveLength(2)
    expect(names(list('topic', topic.id))).toHaveLength(2)
    // The all-stories page: the example sponsor (20), then the app.
    expect(names(list('latest', null))).toEqual([['list.rail.1', 'sponsor'], ['list.rail.2', 'house']])
    // The banner is a sponsor's, with a phone picture, on the home page only.
    const band = resolveZone('home.band', { page: 'home' }, records, NOW)[0]
    expect(band).toMatchObject({ label: 'Sponsor message', href: '/sponsor' })
    expect(band?.phoneImage?.url).toBeTruthy()
  })

  it('run again, it makes nothing and changes nothing', async () => {
    const before = [await count('placement-items'), await count('posts'), await count('sponsors')]
    const report = await seedPlacementsDemo(payload, { apply: true, assetDir, now: NOW })
    expect(report.made).toEqual([])
    expect([await count('placement-items'), await count('posts'), await count('sponsors')]).toEqual(before)
  })

  it('never changes a home page an editor has built, nor a banner that is already there', async () => {
    await payload.updateGlobal({ slug: 'homepage', data: { newsModules: [1, 2, 3].map((i) => ({ heading: `Mine ${i}`, section: sections['local-news']!.id, count: 5, enabled: true })) } as never, overrideAccess: true, context: ctx })
    const report = await seedPlacementsDemo(payload, { apply: true, assetDir, now: NOW })
    expect(report.kept.join('\n')).toMatch(/left as they are/)
    expect((await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })).newsModules?.map((m) => m.heading)).toEqual(['Mine 1', 'Mine 2', 'Mine 3'])
    expect(report.kept.join('\n')).toMatch(/a home page banner/)
  })

  it('skips, and says so, what this database has no sections or promotions for', async () => {
    await cleanDemo()
    for (const slug of ['uwf-news']) await payload.delete({ collection: 'sections', id: sections[slug]!.id, overrideAccess: true, context: ctx })
    await payload.updateGlobal({ slug: 'homepage', data: { newsModules: [] } as never, overrideAccess: true, context: ctx })
    const report = await seedPlacementsDemo(payload, { apply: true, assetDir, now: NOW })
    expect(report.skipped.join('\n')).toMatch(/UWF News: no such section/)
    expect((await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })).newsModules?.map((m) => m.heading)).toEqual(['Local News', 'Local Politics', 'Local Arts', 'Florida News'])
  })
})
