import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * "Use as the home page" (`pages.is_home`): which page is served at `/` is now a box on the page, not its address name. Until now the page whose slug was `home` was the home page,
 * and changing the home page meant renaming two slugs by hand, with `/` a 404 in between. The columns are `20261119_031420_home_page_flag_columns` (sorted early, so the migrations
 * that write pages through the Local API still run on a fresh database; see that file). This is the data step: the page that has been serving `/` (slug `home`, in the home set) gets
 * the box ticked, in the page and its versions, so nothing changes for a visitor. Where no such page exists (production before launch) nothing is ticked. `down` unticks it; the
 * page keeps its slug `home`, which is what it had.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`UPDATE "pages" SET "is_home" = true WHERE "slug" = 'home' AND "page_set" = 'home'`)
  await db.execute(sql`UPDATE "_pages_v" SET "version_is_home" = true WHERE "version_slug" = 'home' AND "version_page_set" = 'home'`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`UPDATE "pages" SET "is_home" = false`)
  await db.execute(sql`UPDATE "_pages_v" SET "version_is_home" = false`)
}
