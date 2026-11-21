import { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'

import { SPONSORSHIP_STARTER } from '../lib/sponsorship/starter'
import { sponsorPagesFromGlobal } from '../lib/sponsorship/to-sections'

/**
 * The six sponsorship pages, redrawn again (PAGE-BLOCKS.md, phase 3): the old coded pages are the standard the pages are held to, so the hub opens
 * on the tinted band with its figures below, the notes are lime again, the digital page draws its sample sponsor messages beside the tables (in
 * Columns, the new layout block), the credit guidelines have their two lists in columns and their pairs as cards. The pushed migrations are not
 * edited; this writes the sections again from the same source and the same mapper.
 *
 * It touches a page only when it has at most two versions: the one `sponsor_pages` made and the one `sponsor_pages_polish` made. A page an
 * editor has saved since has more and is left exactly as it is (the log says so). The limit of the check: an editor's single save made before
 * `sponsor_pages_polish` ran would look like that migration's, which is why nobody should edit these pages until this has been applied.
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
    const versions = await payload.findVersions({ collection: 'pages', where: { parent: { equals: doc.id } }, limit: 3, depth: 0, overrideAccess: true, req })
    if (versions.totalDocs > 2) {
      payload.logger.info(`sponsor_pages_polish2: ${page.path} has been edited since it was made, so it is left as it is.`)
      continue
    }
    await payload.update({ collection: 'pages', id: doc.id, data: { sections: page.sections } as never, draft: false, overrideAccess: true, req, context })
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: see above.
}
