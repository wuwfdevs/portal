import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

import { LISTENS_PATH, listensPages } from '../lib/listening/hub-pages'

/**
 * WUWF Listens, once the query is the core record (owner decision, 2026-11-26; built 2026-11-27).
 *
 * Every question is open to everyone, can be convened around, and carries its own way in, so the hub changes shape: a card for each question with one action,
 * one list of what is coming up, and what came of it. The Tables section, the "reporters' questions" cards and the closing "ask to host" band go, and
 * `/listens/host` goes with them (a request is always about a question now, and is made on the question's own page).
 *
 * 1. The hub page's sections are rewritten straight into its `sections` column and its latest version (the way `sponsor_pages_clean` did, because
 *    Payload merges a block that keeps its `id` with what is stored, and a field the new arrangement leaves out would survive). A page with more than two
 *    versions has been edited by someone and is left alone; the log says so.
 * 2. `/listens/host` is deleted, with its versions. Nothing links to it any more.
 *
 * `down` does nothing: the earlier arrangement is not kept.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  const hub = listensPages().find((page) => page.path === LISTENS_PATH)
  if (hub) {
    const found = await payload.find({ collection: 'pages', where: { path: { equals: LISTENS_PATH } }, limit: 1, depth: 0, draft: true, overrideAccess: true, req })
    const doc = found.docs[0]
    if (doc) {
      const versions = await payload.findVersions({ collection: 'pages', where: { parent: { equals: doc.id } }, limit: 5, depth: 0, overrideAccess: true, req })
      if (versions.totalDocs > 2) {
        payload.logger.info(`listens_hub_questions_core: ${LISTENS_PATH} has been edited since it was made, so it is left as it is.`)
      } else {
        const json = JSON.stringify(hub.sections)
        await db.execute(sql`UPDATE "pages" SET "sections" = ${json}::jsonb WHERE "id" = ${doc.id}`)
        await db.execute(sql`UPDATE "_pages_v" SET "version_sections" = ${json}::jsonb WHERE "parent_id" = ${doc.id} AND "latest" = true`)
      }
    }
  }

  await payload.delete({
    collection: 'pages',
    where: { and: [{ path: { equals: '/listens/host' } }, { pageSet: { equals: 'listens' } }] },
    overrideAccess: true,
    req,
    context: { disableRevalidate: true },
  })
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Nothing to undo: see above.
}
