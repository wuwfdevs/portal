import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The page that became the home page (`home_page_record_site_banner`) was written for the comparison at /home-blocks, and still carries that preview's search words: the SEO title
 * "Home page (blocks)", a description saying it is "not linked from anywhere and not indexed", and a no-referrer switch. On the live front page they would be the tab title, the
 * search result's text and a header that stops the site being credited as the source of its own visits. They are replaced with the station's own, but only where they still
 * hold the preview's values, so anything an editor has written since is kept. A database whose home page was never the preview (or has none) is untouched.
 *
 * `down` puts the preview's words back on a home page that holds the station's.
 */
const OLD_TITLE = 'Home page (blocks)'
const OLD_DESCRIPTION = 'The home page built from blocks, beside the coded home page, for comparison. Not linked from anywhere and not indexed.'
const TITLE = 'WUWF Public Media'
const DESCRIPTION = 'Public radio and journalism for Northwest Florida: local news, NPR, and WUWF originals from Pensacola.'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "pages" SET "meta_title" = ${TITLE}, "meta_description" = ${DESCRIPTION}, "no_referrer" = false
    WHERE "slug" = 'home' AND "page_set" = 'home' AND "meta_title" = ${OLD_TITLE} AND "meta_description" = ${OLD_DESCRIPTION}`)
  await db.execute(sql`
   UPDATE "_pages_v" SET "version_meta_title" = ${TITLE}, "version_meta_description" = ${DESCRIPTION}, "version_no_referrer" = false
    WHERE "version_slug" = 'home' AND "version_page_set" = 'home' AND "version_meta_title" = ${OLD_TITLE} AND "version_meta_description" = ${OLD_DESCRIPTION}`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "pages" SET "meta_title" = ${OLD_TITLE}, "meta_description" = ${OLD_DESCRIPTION}, "no_referrer" = true
    WHERE "slug" = 'home' AND "page_set" = 'home' AND "meta_title" = ${TITLE} AND "meta_description" = ${DESCRIPTION}`)
  await db.execute(sql`
   UPDATE "_pages_v" SET "version_meta_title" = ${OLD_TITLE}, "version_meta_description" = ${OLD_DESCRIPTION}, "version_no_referrer" = true
    WHERE "version_slug" = 'home' AND "version_page_set" = 'home' AND "version_meta_title" = ${TITLE} AND "version_meta_description" = ${DESCRIPTION}`)
}
