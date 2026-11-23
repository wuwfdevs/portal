import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The columns behind the Explore block (hubs redesign, 2026-11-23): an episode's start and end year (`posts.year_start`, `posts.year_end`, and their `_posts_v` twins) and a site's
 * latitude and longitude (`sites.latitude`, `sites.longitude`). Written to sort EARLY, right after `show_home_page_columns` and before `blocks_to_json`, for the reason the home page
 * flag's migration gives: a migration that writes stories through the Local API reads and writes them through the config as it is when it runs, so a database built from the migrations
 * alone fails on a column the config has and the table lacks. `IF NOT EXISTS`, so a database that already has them (Payload's push in development) is left alone. The data step (the years
 * from the period) and the retirement of Then & now are in `20261123_013206_unearthing_explore`, which also carries the schema snapshot.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "year_start" numeric;
  ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "year_end" numeric;
  ALTER TABLE "_posts_v" ADD COLUMN IF NOT EXISTS "version_year_start" numeric;
  ALTER TABLE "_posts_v" ADD COLUMN IF NOT EXISTS "version_year_end" numeric;
  ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "latitude" numeric;
  ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "longitude" numeric;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN IF EXISTS "year_start";
  ALTER TABLE "posts" DROP COLUMN IF EXISTS "year_end";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_year_start";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_year_end";
  ALTER TABLE "sites" DROP COLUMN IF EXISTS "latitude";
  ALTER TABLE "sites" DROP COLUMN IF EXISTS "longitude";`)
}
