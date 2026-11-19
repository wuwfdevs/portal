import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { GIVING_STARTER } from '../lib/giving/starter'
import { givingPagesFromGlobal } from '../lib/giving/to-sections'

/**
 * The four giving pages move into `pages` as sections (PAGE-BLOCKS.md, phase 4). Each is written at the address it already has (/support, /support/ways,
 * /support/legacy, /support/thanks) from the Giving pages global's **current** words, through the Local API, so a staging database keeps whatever an editor
 * has changed. A database whose global was never filled (it has no Give title) is given the starting wording, which is what `giving_form_addresses` writes.
 * The pages are in the giving set and published; the thank-you page asks not to be indexed and to send no referrer, as the route it replaces did. A page
 * that already exists at its address is left alone, so a re-run changes nothing.
 *
 * The same change deletes the four coded views. The global keeps its page fields until the pages are confirmed (phase 7 drops it); the levels, amounts,
 * addresses and contact details the blocks read were copied by `giving_settings`, the migration before this one.
 *
 * `down` removes the four pages this wrote (and nothing else); the coded routes come back with the code.
 */
const PATHS = ['/support', '/support/ways', '/support/legacy', '/support/thanks']

export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const current = await payload.findGlobal({ slug: 'support-page', depth: 0, overrideAccess: true, req })
  const global = current?.give?.hero?.title ? current : GIVING_STARTER
  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of givingPagesFromGlobal(global as never)) {
    const found = await payload.find({ collection: 'pages', where: { path: { equals: page.path } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    if (found.docs.length > 0) continue
    await payload.create({
      collection: 'pages',
      data: {
        title: page.title,
        slug: page.slug,
        path: page.path,
        template: 'sections',
        pageSet: 'giving',
        ...(page.navLabel ? { navLabel: page.navLabel } : {}),
        navOrder: page.navOrder,
        ...(page.noindex ? { noindex: true } : {}),
        ...(page.noReferrer ? { noReferrer: true } : {}),
        sections: page.sections,
        meta: { title: page.title, ...(page.description ? { description: page.description } : {}) },
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
  await payload.delete({ collection: 'pages', where: { and: [{ path: { in: PATHS } }, { pageSet: { equals: 'giving' } }] }, overrideAccess: true, req, context: { disableRevalidate: true } })
}
