import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

/**
 * The hubs' page strips lead to pages, not to parts of a page that may draw nothing (hubs redesign, 2026-11-23). Written for the pages `20261123_020000_radiolive_page` and
 * `20261123_030100_voyager_page` already wrote (staging); `lib/radiolive/to-sections.ts` and `lib/voyager/to-sections.ts` write the same for a database built from the migrations.
 *  - **The Voyager:** each news run's strip link (Campus, Sports, Arts & Life, Opinion) goes to the section's own page (`/campus`), which lists all of its stories. The run on the hub can be empty
 *    once the lead and The Briefing have taken the newest stories, and a link to a part of the page that is not drawn went nowhere.
 *  - **RadioLive:** the strip's "Artists" goes to the artists' page (`/radiolive/artists`), and that page is left out of the strip's own links, so the strip has one Artists link, not two.
 * Only the sections named here, by id, and only the strip fields are touched. Nothing is written where there is no such page, and a re-run changes nothing. An editor's own value is kept: a section that
 * already has a page for its link is left alone. `down` empties the links this wrote and lists the artists' page in the strip again.
 */
type Section = Record<string, unknown> & { id?: string; blockType?: string; anchor?: string | null; navLabel?: string | null; navHref?: string | null }

async function pageOf(args: MigrateUpArgs | MigrateDownArgs, slug: string, set: string) {
  const found = await args.payload.find({ collection: 'pages', where: { and: [{ slug: { equals: slug } }, { pageSet: { equals: set } }] }, limit: 1, depth: 0, draft: false, overrideAccess: true, req: args.req })
  return found.docs[0] ?? null
}

async function writeSections(args: MigrateUpArgs | MigrateDownArgs, id: number | string, sections: Section[]) {
  await args.payload.update({ collection: 'pages', id, data: { sections } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
}

const NEWS_RUN = /^vy-news-\d+$/

export async function up(args: MigrateUpArgs): Promise<void> {
  const voyager = await pageOf(args, 'voyager', 'voyager')
  if (voyager) {
    let changed = false
    const sections = ((voyager.sections ?? []) as unknown as Section[]).map((s) => {
      if (!s.id || !NEWS_RUN.test(s.id) || s.blockType !== 'sectionNewsRun' || !s.navLabel || !s.anchor || (typeof s.navHref === 'string' && s.navHref.trim() !== '')) return s
      changed = true
      return { ...s, navHref: `/${s.anchor}` }
    })
    if (changed) await writeSections(args, voyager.id, sections)
  }

  const radiolive = await pageOf(args, 'radiolive', 'radiolive')
  if (radiolive) {
    let changed = false
    const sections = ((radiolive.sections ?? []) as unknown as Section[]).map((s) => {
      if (s.id !== 'rl-artists' || s.blockType !== 'sectionList' || !s.navLabel || (typeof s.navHref === 'string' && s.navHref.trim() !== '')) return s
      changed = true
      return { ...s, navHref: '/radiolive/artists' }
    })
    if (changed) {
      await writeSections(args, radiolive.id, sections)
      const artists = await pageOf(args, 'radiolive-artists', 'radiolive')
      if (artists && artists.navHidden !== true) await args.payload.update({ collection: 'pages', id: artists.id, data: { navHidden: true } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
    }
  }
}

export async function down(args: MigrateDownArgs): Promise<void> {
  const voyager = await pageOf(args, 'voyager', 'voyager')
  if (voyager) {
    let changed = false
    const sections = ((voyager.sections ?? []) as unknown as Section[]).map((s) => {
      if (!s.id || !NEWS_RUN.test(s.id) || s.navHref !== `/${s.anchor}`) return s
      changed = true
      return { ...s, navHref: '' }
    })
    if (changed) await writeSections(args, voyager.id, sections)
  }
  const radiolive = await pageOf(args, 'radiolive', 'radiolive')
  if (radiolive) {
    let changed = false
    const sections = ((radiolive.sections ?? []) as unknown as Section[]).map((s) => {
      if (s.id !== 'rl-artists' || s.navHref !== '/radiolive/artists') return s
      changed = true
      return { ...s, navHref: '' }
    })
    if (changed) {
      await writeSections(args, radiolive.id, sections)
      const artists = await pageOf(args, 'radiolive-artists', 'radiolive')
      if (artists && artists.navHidden === true) await args.payload.update({ collection: 'pages', id: artists.id, data: { navHidden: false } as never, draft: false, overrideAccess: true, req: args.req, context: { disableRevalidate: true } })
    }
  }
}
