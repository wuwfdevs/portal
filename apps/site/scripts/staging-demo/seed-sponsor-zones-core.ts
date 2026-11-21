// Demonstration content on the STAGING site for the top units, the story zones, the site banner and the home page, so each has something to show
// (PLACEMENTS.md; PAGE-BLOCKS.md → Home). The rules are the same as `seed-placements-core.ts` beside it:
//  - Everything made is labelled "Demonstration" in its text. None of it is reporting, and the sponsor in it is not real.
//  - It is safe to run twice: each record is found by its name first, and what exists is never changed.
//  - It never changes what an editor has set: the banner is set only when there is none, and the home page only when it does not exist.
//  - It sends nothing: no email, no embedding (`disableEmbedding`), no cache refresh (a new deployment reads fresh).
//
// What it makes: a top unit on the home page; a presenting sponsor on the Campus and Local News section pages; two inline bands (the second only in a long story) on stories
// in those two sections; a quiet "Demonstration" notice banner for the home page; and the home page, when there is none, written from the retired Home page global.

import fs from 'node:fs'
import path from 'node:path'

import type { Payload } from 'payload'

import { homepageToSections, HOME_PAGE, type HomepageFields } from '../../src/lib/homepage/to-sections'
import { DEMO } from './seed-placements-core'

export interface SeedOptions {
  apply: boolean
  assetDir: string
  log?: (line: string) => void
}
export interface SeedReport {
  made: string[]
  kept: string[]
  skipped: string[]
}

const ctx = { disableRevalidate: true, disableEmbedding: true }
/** The sections the demonstration placements are aimed at, when they exist on the database. */
export const DEMO_SECTIONS = ['campus', 'local-news'] as const

export async function seedSponsorZonesDemo(payload: Payload, opts: SeedOptions): Promise<SeedReport> {
  const log = opts.log ?? (() => undefined)
  const report: SeedReport = { made: [], kept: [], skipped: [] }
  const note = (kind: keyof SeedReport, line: string) => {
    report[kind].push(line)
    log(`${kind === 'made' ? (opts.apply ? 'made   ' : 'would  ') : kind === 'kept' ? 'exists ' : 'skipped'} ${line}`)
  }
  const first = async <T extends { id: string | number }>(collection: string, where: Record<string, unknown>): Promise<T | null> =>
    ((await payload.find({ collection: collection as never, where: where as never, limit: 1, depth: 0, overrideAccess: true })).docs[0] as unknown as T | undefined) ?? null
  const create = async <T extends { id: string | number }>(collection: string, data: Record<string, unknown>, file?: unknown): Promise<T | null> =>
    opts.apply ? ((await payload.create({ collection: collection as never, data: data as never, overrideAccess: true, context: ctx, ...(file ? { file: file as never } : {}) })) as unknown as T) : ({ id: `(new ${collection})` } as unknown as T)

  // ---- the sample sponsor (the one `seed-placements-core.ts` makes) and the artwork -------------------------------------------------------
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
  const top = await picture('demo-sponsor-top-wide.png', `${DEMO} top unit`)
  const topPhone = await picture('demo-sponsor-top-wide-phone.png', `${DEMO} top unit for phones`)
  const tile = await picture('demo-sponsor-tile.png', `${DEMO} sponsor tile`)
  const band = await picture('demo-sponsor-banner.png', `${DEMO} sponsor banner`)
  const bandPhone = await picture('demo-sponsor-banner-phone.png', `${DEMO} sponsor banner for phones`)

  // `refreshPictures`: a top unit's shape changed (970 by 250 became 1600 by 200), so a demonstration placement made with the old picture gets the new one. Only these
  // demonstration records are touched, and only when their picture is not already the current one.
  const place = async (name: string, data: Record<string, unknown>, opts2: { refreshPictures?: boolean } = {}) => {
    const existing = await first<{ id: string | number; image?: unknown; phoneImage?: unknown }>('placement-items', { name: { equals: name } })
    if (!existing) {
      await create('placement-items', { name, ...data })
      return note('made', `placement "${name}"`)
    }
    const idOf = (v: unknown) => (v && typeof v === 'object' ? (v as { id: string | number }).id : v)
    if (opts2.refreshPictures && data.image && String(idOf(existing.image)) !== String(data.image)) {
      if (opts.apply) await payload.update({ collection: 'placement-items', id: existing.id, data: { image: data.image, phoneImage: data.phoneImage ?? null } as never, overrideAccess: true, context: ctx })
      return note('made', `placement "${name}": picture replaced with the current top-unit shape`)
    }
    note('kept', `placement "${name}"`)
  }
  const common = { kind: 'sponsor', sponsor: sponsor?.id, enabled: true, href: '/sponsor' }

  // ---- the home page's top unit -----------------------------------------------------------------------------------------------------------
  if (top && sponsor) {
    await place(`${DEMO}: example sponsor, home page top unit`, { ...common, zone: 'home.top', image: top.id, phoneImage: topPhone?.id, alt: `${DEMO} top unit: example sponsor, your message here`, order: 10 }, { refreshPictures: true })
  }

  // ---- a presenting sponsor on two section pages, and the story zones on stories in them ----------------------------------------------------
  for (const slug of DEMO_SECTIONS) {
    const section = await first<{ id: string | number; title?: string }>('sections', { slug: { equals: slug } })
    if (!section) {
      note('skipped', `placements for the ${slug} section: no such section here`)
      continue
    }
    const where = { scope: 'chosen', sections: [section.id] }
    if (top && sponsor) await place(`${DEMO}: example sponsor, ${slug} presenting sponsor`, { ...common, zone: 'list.top', image: top.id, phoneImage: topPhone?.id, alt: `${DEMO} presenting sponsor: example sponsor, your message here`, ...where, order: 10 }, { refreshPictures: true })
    if (band && sponsor) {
      await place(`${DEMO}: example sponsor, ${slug} story band`, { ...common, zone: 'story.inline', image: band.id, phoneImage: bandPhone?.id, alt: `${DEMO} band: example sponsor, your message here`, ...where, order: 10 })
      // The second band, for a long story (sixteen paragraphs or more).
      await place(`${DEMO}: example sponsor, ${slug} story band, second place`, { ...common, zone: 'story.inline', image: band.id, phoneImage: bandPhone?.id, alt: `${DEMO} band: example sponsor, your message here`, ...where, order: 20 })
    }
  }

  // ---- the site banner: a quiet notice, only when there is none ----------------------------------------------------------------------------
  const banner = (await payload.findGlobal({ slug: 'site-banner', depth: 0, overrideAccess: true })) as unknown as { active?: boolean | null; headline?: string | null }
  if (banner.active || banner.headline?.trim()) note('kept', 'site banner (left as it is)')
  else {
    if (opts.apply) {
      await payload.updateGlobal({
        slug: 'site-banner',
        data: { active: true, scope: 'home', style: 'notice', label: DEMO, headline: `${DEMO} notice: this banner is sample content for design review`, body: 'Switch it off under Site settings, Site banner.' } as never,
        overrideAccess: true,
        context: ctx,
      })
    }
    note('made', 'site banner (a quiet notice on the home page)')
  }

  // ---- the home page, when this database has none: written from the retired Home page global's words ----------------------------------------
  if (await first('pages', { isHome: { equals: true } })) note('kept', 'the home page')
  else {
    const home = (await payload.findGlobal({ slug: 'homepage', depth: 0, overrideAccess: true })) as unknown as HomepageFields
    const { sections } = homepageToSections(home)
    if (opts.apply) {
      await payload.create({
        collection: 'pages',
        draft: false,
        overrideAccess: true,
        context: ctx,
        data: { title: HOME_PAGE.title, slug: HOME_PAGE.slug, generateSlug: false, isHome: true, template: 'sections', pageSet: HOME_PAGE.pageSet, sections, meta: { title: HOME_PAGE.seoTitle, description: HOME_PAGE.summary }, _status: 'published' } as never,
      })
    }
    note('made', `the home page (${sections.length} sections)`)
  }
  return report
}
