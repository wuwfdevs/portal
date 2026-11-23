import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Explore block's data step and the retirement of Then & now (hubs redesign, 2026-11-23). The columns are in `20261119_031424_unearthing_explore_columns` (early-named, see it).
 *
 * 1. Seed each episode's start and end year from its period, for episodes (the published row and every version) that have a period and no years yet. The table is the same one the code
 *    falls back on (`lib/explore/period-years.ts`; a test keeps the two equal). Years are signed integers: negative is BCE, and there is no year 0. These are coarse starting values
 *    that an editor refines; an episode with years of its own is never touched.
 * 2. Drop Then & now from the Unearthing Florida hub's settings: the pairs table and the two text columns (owner decision, 2026-11-23: Then & Now is dropped).
 *
 * The `down` puts the columns and the table back, empty; the seeded years are left in place (they are only a starting value, and the early migration's `down` drops the columns).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "posts" AS p SET "year_start" = v.y1, "year_end" = v.y2
    FROM (VALUES
      ('paleoindian-archaic', -10000, -1000),
      ('woodland-mississippian', -1000, 1500),
      ('first-spanish', 1513, 1763),
      ('british-west-florida', 1763, 1783),
      ('second-spanish', 1783, 1821),
      ('territory-statehood', 1821, 1861),
      ('civil-war', 1861, 1865)
    ) AS v(period, y1, y2)
    WHERE p."period"::text = v.period AND p."year_start" IS NULL AND p."year_end" IS NULL;
  UPDATE "_posts_v" AS p SET "version_year_start" = v.y1, "version_year_end" = v.y2
    FROM (VALUES
      ('paleoindian-archaic', -10000, -1000),
      ('woodland-mississippian', -1000, 1500),
      ('first-spanish', 1513, 1763),
      ('british-west-florida', 1763, 1783),
      ('second-spanish', 1783, 1821),
      ('territory-statehood', 1821, 1861),
      ('civil-war', 1861, 1865)
    ) AS v(period, y1, y2)
    WHERE p."version_period"::text = v.period AND p."version_year_start" IS NULL AND p."version_year_end" IS NULL;
  DROP TABLE IF EXISTS "unearthing_hub_then_now_pairs" CASCADE;
  ALTER TABLE "unearthing_hub" DROP COLUMN IF EXISTS "then_now_heading";
  ALTER TABLE "unearthing_hub" DROP COLUMN IF EXISTS "then_now_blurb";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE IF NOT EXISTS "unearthing_hub_then_now_pairs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"then_id" integer NOT NULL,
  	"now_id" integer NOT NULL
  );
  ALTER TABLE "unearthing_hub" ADD COLUMN IF NOT EXISTS "then_now_heading" varchar;
  ALTER TABLE "unearthing_hub" ADD COLUMN IF NOT EXISTS "then_now_blurb" varchar;
  ALTER TABLE "unearthing_hub_then_now_pairs" ADD CONSTRAINT "unearthing_hub_then_now_pairs_then_id_posts_id_fk" FOREIGN KEY ("then_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "unearthing_hub_then_now_pairs" ADD CONSTRAINT "unearthing_hub_then_now_pairs_now_id_posts_id_fk" FOREIGN KEY ("now_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "unearthing_hub_then_now_pairs" ADD CONSTRAINT "unearthing_hub_then_now_pairs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."unearthing_hub"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX IF NOT EXISTS "unearthing_hub_then_now_pairs_order_idx" ON "unearthing_hub_then_now_pairs" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "unearthing_hub_then_now_pairs_parent_id_idx" ON "unearthing_hub_then_now_pairs" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "unearthing_hub_then_now_pairs_then_idx" ON "unearthing_hub_then_now_pairs" USING btree ("then_id");
  CREATE INDEX IF NOT EXISTS "unearthing_hub_then_now_pairs_now_idx" ON "unearthing_hub_then_now_pairs" USING btree ("now_id");`)
}
