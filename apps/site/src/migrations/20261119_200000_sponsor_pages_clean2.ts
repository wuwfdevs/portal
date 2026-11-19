import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { SPONSORSHIP_STARTER } from '../lib/sponsorship/starter'
import { pageIsUntouched } from '../lib/sponsorship/untouched'
import { sponsorPagesFromGlobal } from '../lib/sponsorship/to-sections'

/**
 * `sponsor_pages_clean` again, with a better test of "has someone edited this page". The first one counted versions, and on staging the hub had a
 * fourth version that was only an autosave draft made by opening the page in the admin (its sections were the published ones, byte for byte),
 * so the migration left the hub as it was and the duplicate figures stayed. A page is untouched now when it has at most three versions that are
 * not autosaves and every autosave draft holds exactly the published sections (`lib/sponsorship/untouched.ts`, tested). It writes the mapped
 * sections into the `sections` column and into the latest version (the draft too), with no merge and no new version. A page someone has
 * changed is still left alone and the log says so. Running it on a page that is already clean writes the same content again.
 *
 * `down` does nothing.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const current = await payload.findGlobal({ slug: 'sponsorship', depth: 0, overrideAccess: true, req })
  const global = current?.hub?.hero?.title ? current : SPONSORSHIP_STARTER
  for (const page of sponsorPagesFromGlobal(global as never)) {
    const found = await payload.find({ collection: 'pages', where: { path: { equals: page.path } }, limit: 1, depth: 0, draft: false, overrideAccess: true, req })
    const doc = found.docs[0]
    if (!doc) continue
    const versions = await payload.findVersions({ collection: 'pages', where: { parent: { equals: doc.id } }, limit: 50, depth: 0, overrideAccess: true, draft: true, req })
    const rows = versions.docs.map((v) => ({ autosave: (v as { autosave?: boolean }).autosave, sections: (v.version as { sections?: unknown }).sections }))
    if (!pageIsUntouched(rows, doc.sections)) {
      payload.logger.info(`sponsor_pages_clean2: ${page.path} has been edited since it was made, so it is left as it is.`)
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
