import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SPONSORSHIP_STARTER } from '../lib/sponsorship/starter'
import { sponsorPagesFromGlobal } from '../lib/sponsorship/to-sections'

/**
 * The six sponsorship pages, written clean (PAGE-BLOCKS.md, phase 3 follow-up). `sponsor_pages_polish` and `sponsor_pages_polish2` rewrote the
 * pages through the Local API, and **Payload merges a block that keeps its `id` with what is already stored**, so a field the new arrangement
 * leaves out survives. On staging that left the hub's opening band holding the four figure tiles of an earlier arrangement beside its words
 * (they were drawn again in the row below it) and three sections still set to put their heading beside their content.
 *
 * This writes the mapped sections straight into the page's `sections` column and into its latest version, so nothing is merged and no new
 * version is made. A block field is one `jsonb` column (`blocksAsJSON`), so this is the whole write. Pages with more than three versions (the
 * one `sponsor_pages` made and the two polishing ones) have been edited by someone and are left alone; the log says so.
 *
 * `down` does nothing: the earlier arrangement is not kept.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const current = await payload.findGlobal({ slug: 'sponsorship', depth: 0, overrideAccess: true, req })
  const global = current?.hub?.hero?.title ? current : SPONSORSHIP_STARTER
  for (const page of sponsorPagesFromGlobal(global as never)) {
    const found = await payload.find({ collection: 'pages', where: { path: { equals: page.path } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    const doc = found.docs[0]
    if (!doc) continue
    const versions = await payload.findVersions({ collection: 'pages', where: { parent: { equals: doc.id } }, limit: 5, depth: 0, overrideAccess: true, req })
    if (versions.totalDocs > 3) {
      payload.logger.info(`sponsor_pages_clean: ${page.path} has been edited since it was made, so it is left as it is.`)
      continue
    }
    const json = JSON.stringify(page.sections)
    await db.execute(sql`UPDATE "pages" SET "sections" = ${json}::jsonb WHERE "id" = ${doc.id}`)
    await db.execute(sql`UPDATE "_pages_v" SET "version_sections" = ${json}::jsonb WHERE "parent_id" = ${doc.id} AND "latest" = true`)
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: see above.
}
