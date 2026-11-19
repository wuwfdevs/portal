import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { SPONSORSHIP_STARTER } from '../lib/sponsorship/starter'
import { sponsorPagesFromGlobal } from '../lib/sponsorship/to-sections'

/**
 * The six sponsorship pages, redrawn (PAGE-BLOCKS.md, phase 3 design pass). `sponsor_pages` wrote them with the first arrangement of the
 * blocks; the blocks have since been given the layouts the design boards use (a dark opening band with figures beside it, a heading beside its
 * cards, boxed figures and cards, pickers with a total and rows, a check list in two columns). The pushed migration is not edited, so this one
 * writes the sections again, from the same source and the same mapper.
 *
 * It only touches a page nobody has edited: one with a single version (the one the first migration made). A page an editor has saved since is
 * left exactly as it is, and the log says so. A database where the first migration has just run (a fresh install, production at launch) has
 * single-version pages, so they are written again with the same sections, which changes nothing.
 *
 * `down` does nothing: the earlier arrangement is not kept, and the blocks that drew it still draw this one.
 */
export async function up({ payload, req }: MigrateUpArgs): Promise<void> {
  const current = await payload.findGlobal({ slug: 'sponsorship', depth: 0, overrideAccess: true, req })
  const global = current?.hub?.hero?.title ? current : SPONSORSHIP_STARTER
  const context = { disableRevalidate: true, disableEmbedding: true }
  for (const page of sponsorPagesFromGlobal(global as never)) {
    const found = await payload.find({ collection: 'pages', where: { path: { equals: page.path } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    const doc = found.docs[0]
    if (!doc) continue
    const versions = await payload.findVersions({ collection: 'pages', where: { parent: { equals: doc.id } }, limit: 2, depth: 0, overrideAccess: true, req })
    if (versions.totalDocs > 1) {
      payload.logger.info(`sponsor_pages_polish: ${page.path} has been edited since it was made, so it is left as it is.`)
      continue
    }
    await payload.update({ collection: 'pages', id: doc.id, data: { sections: page.sections } as never, draft: false, overrideAccess: true, req, context })
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: see above.
}
