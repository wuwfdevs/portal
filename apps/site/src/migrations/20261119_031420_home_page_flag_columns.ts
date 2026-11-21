import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The columns behind "Use as the home page" (`pages.is_home`, `_pages_v.version_is_home`), written to sort EARLY, right after `sections_pages` and before `blocks_to_json`, on purpose.
 * Several later migrations write pages through the Local API (`sponsor_pages`, `giving_pages_as_sections`, ...), and Payload reads and writes a document through the config as it is
 * when the migration runs, so on a database built from the migrations alone (production at launch, a new station, `pnpm verify:migrations`) every one of them fails on a column the
 * config has and the table does not yet. A pages column added at the end of the history breaks the history. This file adds the columns where they cannot be missing; the data step
 * (tick the box on the page that serves `/`) is `20261121_164549_home_page_flag`, after the page set exists. Where Payload would write them is the same (`IF NOT EXISTS`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "is_home" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "version_is_home" boolean DEFAULT false;
  CREATE INDEX IF NOT EXISTS "pages_is_home_idx" ON "pages" USING btree ("is_home");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_version_is_home_idx" ON "_pages_v" USING btree ("version_is_home");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "pages_is_home_idx";
  DROP INDEX IF EXISTS "_pages_v_version_version_is_home_idx";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "is_home";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_is_home";`)
}
