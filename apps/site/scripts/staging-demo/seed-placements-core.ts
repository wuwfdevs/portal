// Demonstration content on the STAGING site for the news sections and sponsor placements, so each of those features has something to show.
// The rules are the same as `seed.ts` beside it, and are kept here where they can be tested without a network:
//  - Everything made is labelled "Demonstration" in its text. None of it is reporting, and no sponsor in it is real.
//  - It is safe to run twice: each record is found by its name or title first, and what exists is never changed.
//  - It never changes what an editor has set: it adds news sections only to a home page with fewer than three, and only appends.
//  - It sends nothing: no email, no embedding (`disableEmbedding`), no cache refresh (a new deployment reads fresh).
//
// What it makes: a Florida News section with six demonstration stories from a "partner" (the owner features partner content: a section's run is
// every story filed under it, whatever its source); the home page's news sections; a sample banner with a phone picture; and five placements on
// the list pages, aimed at one section, several sections, a reporter and a topic, the all-stories page and every page, using a sample sponsor and WUWF's
// own promotions already in the home rail.

import fs from 'node:fs'
import path from 'node:path'

import type { Payload } from 'payload'

export const DEMO = 'Demonstration'
export const FLORIDA_STORIES = [
  'Legislature opens a new term',
  'Property tax special session considered',
  'State sued over special election timing',
  'Navy weighs contracts for drone boats',
  'Insurers report storm losses',
  'Teacher pay talks resume',
]
/** Sections the home page shows when it has fewer than three, in order; each is used only if it exists here. */
export const DEMO_MODULES = [
  { slug: 'local-news', heading: 'Local News' },
  { slug: 'local-politics', heading: 'Local Politics' },
  { slug: 'local-arts', heading: 'Local Arts' },
  { slug: 'florida-news', heading: 'Florida News' },
  { slug: 'uwf-news', heading: 'UWF News' },
] as const

export interface SeedOptions {
  apply: boolean
  assetDir: string
  log?: (line: string) => void
  now?: Date
}
export interface SeedReport {
  made: string[]
  kept: string[]
  skipped: string[]
}

const ctx = { disableRevalidate: true, disableEmbedding: true }
const para = (text: string) => ({ type: 'paragraph', version: 1, direction: 'ltr', format: '', indent: 0, children: [{ type: 'text', version: 1, text, format: 0, mode: 'normal', style: '', detail: 0 }] })
const lexical = (...paras: string[]) => ({ root: { type: 'root', version: 1, direction: 'ltr', format: '', indent: 0, children: paras.map(para) } })

export async function seedPlacementsDemo(payload: Payload, opts: SeedOptions): Promise<SeedReport> {
  const log = opts.log ?? (() => undefined)
  const now = opts.now ?? new Date()
  const report: SeedReport = { made: [], kept: [], skipped: [] }
  const note = (kind: keyof SeedReport, line: string) => {
    report[kind].push(line)
    log(`${kind === 'made' ? (opts.apply ? 'made   ' : 'would  ') : kind === 'kept' ? 'exists ' : 'skipped'} ${line}`)
  }
  const first = async <T extends { id: string | number }>(collection: string, where: Record<string, unknown>): Promise<T | null> =>
    ((await payload.find({ collection: collection as never, where: where as never, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as T | undefined) ?? null
  // In a dry run nothing is written, but what a real run would make must count as there for the steps after it, or the dry run would report
  // "skipped" for things a real run does.
  const create = async <T extends { id: string | number }>(collection: string, data: Record<string, unknown>, file?: unknown): Promise<T | null> =>
    opts.apply ? ((await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...(file ? { file: file as never } : {}) })) as unknown as T) : ({ id: `(new ${collection})` } as unknown as T)

  // ---- Florida News: a section and six demonstration stories from a partner -------------------------------------------------------------
  let florida = await first<{ id: string | number }>('sections', { slug: { equals: 'florida-news' } })
  if (florida) note('kept', 'section Florida News')
  else {
    florida = await create('sections', { title: 'Florida News', slug: 'florida-news' })
    note('made', 'section Florida News')
  }
  for (const [i, headline] of FLORIDA_STORIES.entries()) {
    const title = `${DEMO}: ${headline}`
    if (await first('posts', { title: { equals: title } })) {
      note('kept', `story "${title}"`)
      continue
    }
    if (florida) {
      await create('posts', {
        title,
        content: lexical(`${DEMO} content for the staging site, standing in for a story from a news partner. It is not reporting.`),
        _status: 'published',
        section: florida.id,
        source: 'wire',
        publishedAt: new Date(now.getTime() - (i + 1) * 5 * 3_600_000).toISOString(),
        meta: { description: `${DEMO} content standing in for a partner's story. Not reporting.` },
      })
    }
    note('made', `story "${title}"`)
  }

  // ---- the home page's news runs ------------------------------------------------------------------------------------------------------------
  // The home page is a page record (a News run block per section). Runs are added after the last one, only while there are fewer than three; a database with no home page is
  // left without (the sponsor-zones seed writes one).
  type Run = { id?: string; blockType: string; section?: string | number | { id: string | number } | null; [field: string]: unknown }
  const homePage = await first<{ id: string | number; sections?: Run[] | null }>('pages', { isHome: { equals: true } })
  if (!homePage) note('skipped', 'home page news runs: there is no home page here')
  else {
    const sections: Run[] = homePage.sections ?? []
    const runs = sections.filter((b) => b.blockType === 'sectionNewsRun')
    if (runs.length >= 3) note('kept', `home page news runs (${runs.length}, left as they are)`)
    else {
      const have = new Set(runs.map((b) => String(typeof b.section === 'object' && b.section ? b.section.id : b.section)))
      const added: Run[] = []
      for (const m of DEMO_MODULES) {
        const sec = m.slug === 'florida-news' ? florida : await first<{ id: string | number }>('sections', { slug: { equals: m.slug } })
        if (!sec) {
          note('skipped', `news run ${m.heading}: no such section here`)
          continue
        }
        if (have.has(String(sec.id))) continue
        added.push({ id: `demo-news-${m.slug}`, blockType: 'sectionNewsRun', tone: 'plain', hidden: false, section: sec.id, count: 5, heading: { title: m.heading } })
      }
      if (opts.apply && added.length > 0) {
        const lastRun = sections.map((b) => b.blockType).lastIndexOf('sectionNewsRun')
        const at = lastRun >= 0 ? lastRun + 1 : Math.min(1, sections.length)
        const next = [...sections.slice(0, at), ...added, ...sections.slice(at)]
        await payload.update({ collection: 'pages', id: homePage.id, data: { sections: next } as never, draft: false, overrideAccess: true, context: ctx })
      }
      for (const m of added) note('made', `home page news run ${(m.heading as { title: string }).title}`)
      if (added.length === 0) note('kept', 'home page news runs (nothing to add)')
    }
  }

  // ---- the sample sponsor and its artwork --------------------------------------------------------------------------------------------------
  const sponsorName = `Example Sponsor (${DEMO.toLowerCase()})`
  let sponsor = await first<{ id: string | number }>('sponsors', { name: { equals: sponsorName } })
  if (sponsor) note('kept', `sponsor ${sponsorName}`)
  else {
    sponsor = await create('sponsors', { name: sponsorName, notes: `${DEMO} sponsor for the staging site. Not a real sponsor.` })
    note('made', `sponsor ${sponsorName}`)
  }
  const picture = async (file: string, alt: string): Promise<{ id: string | number } | null> => {
    const key = `demonstration:${file}`
    const found = await first<{ id: string | number }>('media', { 'legacy.sourceUrl': { equals: key } })
    if (found) {
      note('kept', `picture ${file}`)
      return found
    }
    const data = fs.readFileSync(path.join(opts.assetDir, file))
    const doc = await create<{ id: string | number }>('media', { alt, source: `${DEMO} artwork for the staging site.`, legacy: { sourceUrl: key } }, { data, mimetype: 'image/png', name: file, size: data.length })
    note('made', `picture ${file}`)
    return doc
  }
  const tile = await picture('demo-sponsor-tile.png', `${DEMO} sponsor tile`)
  const banner = await picture('demo-sponsor-banner.png', `${DEMO} sponsor banner`)
  const bannerPhone = await picture('demo-sponsor-banner-phone.png', `${DEMO} sponsor banner for phones`)

  const exists = (name: string) => first('placement-items', { name: { equals: name } })
  const place = async (name: string, data: Record<string, unknown>) => {
    if (await exists(name)) return note('kept', `placement "${name}"`)
    await create('placement-items', { name, ...data })
    note('made', `placement "${name}"`)
  }

  // ---- the home banner (only when the home page has none) --------------------------------------------------------------------------------
  const anyBanner = await first('placement-items', { zone: { equals: 'home.band' } })
  if (anyBanner) note('kept', 'a home page banner (left as it is)')
  else if (banner && sponsor) {
    await place(`${DEMO}: example sponsor, home page banner`, { kind: 'sponsor', sponsor: sponsor.id, zone: 'home.band', image: banner.id, phoneImage: bannerPhone?.id, alt: `${DEMO} banner: example sponsor, your message here`, href: '/sponsor', order: 10 })
  } else if (!opts.apply) note('made', 'placement "home page banner"')

  // ---- the list-page rail: five placements, each aimed differently ------------------------------------------------------------------------
  const id = async (collection: string, slug: string) => (await first<{ id: string | number }>(collection, { slug: { equals: slug } }))?.id
  const [localNews, localArts, commentary, reporter, topic] = await Promise.all([id('sections', 'local-news'), id('sections', 'local-arts'), id('sections', 'commentary'), id('contributors', 'dave-dunwoody'), id('categories', 'city-of-pensacola')])
  const one = (...v: (string | number | undefined)[]) => v.filter((x): x is string | number => x !== undefined)
  // WUWF's own promotions: taken from the placements already in the home rail (the import of the live rail), so their pictures and links are real.
  const own = async (prefix: string) => {
    const found = await payload.find({ collection: 'placement-items', where: { and: [{ zone: { equals: 'home.rail' } }, { name: { like: prefix } }] }, limit: 1, depth: 0, overrideAccess: true })
    const d = found.docs[0]
    return d ? { image: typeof d.image === 'object' ? (d.image as { id: string | number }).id : d.image, alt: d.alt, href: d.href } : null
  }
  const [app, club, pmpm] = await Promise.all([own('WUWF app'), own('Book Club'), own('Protect My Public Media')])

  if (tile && sponsor && localNews) {
    await place(`${DEMO}: example sponsor, Local News pages`, { kind: 'sponsor', sponsor: sponsor.id, zone: 'list.rail', image: tile.id, alt: `${DEMO} tile: example sponsor, your message here`, href: '/sponsor', scope: 'chosen', sections: one(localNews), order: 10 })
  } else note('skipped', 'placement "example sponsor, Local News pages": no tile or no Local News section here')
  if (tile && sponsor) {
    await place(`${DEMO}: example sponsor, all-stories page`, { kind: 'sponsor', sponsor: sponsor.id, zone: 'list.rail', image: tile.id, alt: `${DEMO} tile: example sponsor, your message here`, href: '/sponsor', scope: 'chosen', includeLatest: true, order: 20 })
  }
  if (club && one(localArts, commentary).length > 0) {
    await place(`${DEMO}: Book Club, Local Arts and Commentary pages`, { kind: 'house', zone: 'list.rail', ...club, scope: 'chosen', sections: one(localArts, commentary), order: 30 })
  } else note('skipped', 'placement "Book Club, Local Arts and Commentary pages": no Book Club tile in the home rail or no such sections here')
  if (pmpm && one(reporter, topic).length > 0) {
    await place(`${DEMO}: Protect My Public Media, one reporter and one topic`, { kind: 'house', zone: 'list.rail', ...pmpm, scope: 'chosen', people: one(reporter), topics: one(topic), order: 40 })
  } else note('skipped', 'placement "Protect My Public Media, one reporter and one topic": no such tile, reporter or topic here')
  if (app) await place(`${DEMO}: WUWF app, every list page`, { kind: 'house', zone: 'list.rail', ...app, scope: 'all', order: 50 })
  else note('skipped', 'placement "WUWF app, every list page": no WUWF app tile in the home rail')

  return report
}
