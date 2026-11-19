import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { SPONSORSHIP_STARTER } from '../lib/sponsorship/starter'
import { sponsorPagesFromGlobal } from '../lib/sponsorship/to-sections'

/**
 * The six sponsorship pages move into `pages` as sections (PAGE-BLOCKS.md, phase 3). Each is written at the address it already has
 * (/sponsor, /sponsor/on-air, /sponsor/digital, /sponsor/events, /sponsor/audience, /sponsor/credit-guidelines) from the Sponsorship
 * global's **current** words, through the Local API, so a staging database keeps whatever an editor has changed. A database whose global
 * was never filled (it has no hub title) is given the starting wording, which is what the earlier `sponsorship_copy` migration writes.
 * The pages are in the sponsor set and published. A page that already exists at its address is left alone, so a re-run changes nothing.
 *
 * The same change deletes the six coded routes and their views. The global keeps its page fields until the pages are confirmed (phase 7
 * drops them); the settings the blocks read were copied by `sponsorship_settings`, the migration before this one.
 *
 * `down` removes the six pages this wrote (and nothing else); the coded routes come back with the code.
 */
const PATHS = ['/sponsor', '/sponsor/on-air', '/sponsor/digital', '/sponsor/events', '/sponsor/audience', '/sponsor/credit-guidelines']

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const current = await payload.findGlobal({ slug: 'sponsorship', depth: 0, overrideAccess: true, req })
  const global = current?.hub?.hero?.title ? current : SPONSORSHIP_STARTER
  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of sponsorPagesFromGlobal(global as never)) {
    const found = await payload.find({ collection: 'pages', where: { path: { equals: page.path } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    if (found.docs.length > 0) continue
    await payload.create({
      collection: 'pages',
      data: {
        title: page.title,
        slug: page.slug,
        path: page.path,
        template: 'sections',
        pageSet: 'sponsor',
        navLabel: page.navLabel,
        navOrder: page.navOrder,
        sections: page.sections,
        meta: { title: page.title, description: page.description },
        _status: 'published',
      } as never,
      draft: false,
      overrideAccess: true,
      req,
      context,
    })
  }
}

export async function down({ payload, req }: MigrateDownArgs): Promise<void> {
  await payload.delete({ collection: 'pages', where: { and: [{ path: { in: PATHS } }, { pageSet: { equals: 'sponsor' } }] }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
