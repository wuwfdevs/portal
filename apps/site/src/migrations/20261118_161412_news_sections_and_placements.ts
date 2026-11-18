import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * News sections on the home page, and the sponsor and promo placements.
 *
 * The home page's single "Local news" list (a heading, one section, a count) becomes an ordered list of news sections, each with its own heading,
 * section, count and on/off switch. This migration carries the old list over as the first section (so what an editor set keeps showing), and,
 * only where the home page has no sections yet, adds the three the station leads with (Local News, Music & Arts, Florida News) for each of those
 * that exists. A database with no sections yet (before the import) gets none; the page then shows one "Latest stories" run until an editor adds
 * sections in the admin. It also creates the `placements` global (the home page rail and banner): empty, filled in the admin.
 *
 * Plain SQL on purpose: a migration that goes through the Local API reads the *current* schema and breaks on a fresh database once a later migration
 * touches the same global (see `giving_form_addresses`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_placements_home_rail_kind" AS ENUM('sponsor', 'house');
  CREATE TYPE "public"."enum_placements_home_band_kind" AS ENUM('sponsor', 'house');
  CREATE TABLE "homepage_news_modules" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL,
  	"section_id" integer NOT NULL,
  	"count" numeric DEFAULT 5,
  	"enabled" boolean DEFAULT true
  );
  
  CREATE TABLE "placements_home_rail" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_placements_home_rail_kind" DEFAULT 'sponsor' NOT NULL,
  	"sponsor" varchar,
  	"image_id" integer NOT NULL,
  	"alt" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"run_from" timestamp(3) with time zone,
  	"run_until" timestamp(3) with time zone,
  	"enabled" boolean DEFAULT true
  );
  
  CREATE TABLE "placements_home_band" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"kind" "enum_placements_home_band_kind" DEFAULT 'sponsor' NOT NULL,
  	"sponsor" varchar,
  	"image_id" integer NOT NULL,
  	"alt" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"phone_image_id" integer,
  	"run_from" timestamp(3) with time zone,
  	"run_until" timestamp(3) with time zone,
  	"enabled" boolean DEFAULT true
  );
  
  CREATE TABLE "placements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "homepage_news_modules" ADD CONSTRAINT "homepage_news_modules_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_news_modules" ADD CONSTRAINT "homepage_news_modules_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "placements_home_rail" ADD CONSTRAINT "placements_home_rail_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placements_home_rail" ADD CONSTRAINT "placements_home_rail_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "placements_home_band" ADD CONSTRAINT "placements_home_band_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placements_home_band" ADD CONSTRAINT "placements_home_band_phone_image_id_media_id_fk" FOREIGN KEY ("phone_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placements_home_band" ADD CONSTRAINT "placements_home_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_news_modules_order_idx" ON "homepage_news_modules" USING btree ("_order");
  CREATE INDEX "homepage_news_modules_parent_id_idx" ON "homepage_news_modules" USING btree ("_parent_id");
  CREATE INDEX "homepage_news_modules_section_idx" ON "homepage_news_modules" USING btree ("section_id");
  CREATE INDEX "placements_home_rail_order_idx" ON "placements_home_rail" USING btree ("_order");
  CREATE INDEX "placements_home_rail_parent_id_idx" ON "placements_home_rail" USING btree ("_parent_id");
  CREATE INDEX "placements_home_rail_image_idx" ON "placements_home_rail" USING btree ("image_id");
  CREATE INDEX "placements_home_band_order_idx" ON "placements_home_band" USING btree ("_order");
  CREATE INDEX "placements_home_band_parent_id_idx" ON "placements_home_band" USING btree ("_parent_id");
  CREATE INDEX "placements_home_band_image_idx" ON "placements_home_band" USING btree ("image_id");
  CREATE INDEX "placements_home_band_phone_image_idx" ON "placements_home_band" USING btree ("phone_image_id");`)

  // The old list becomes the first news section, so a configured home page looks the same after this runs.
  await db.execute(sql`
  INSERT INTO "homepage_news_modules" ("_order", "_parent_id", "id", "heading", "section_id", "count", "enabled")
  SELECT 1, h."id", md5(random()::text || clock_timestamp()::text), COALESCE(NULLIF(trim(h."local_news_heading"), ''), 'Northwest Florida'),
         h."local_news_section_id", LEAST(8, GREATEST(3, ROUND(COALESCE(h."local_news_count", 5))::integer)), true
  FROM "homepage" h
  WHERE h."local_news_section_id" IS NOT NULL;`)

  // Where the home page still has no sections, the three the station leads with, for each that exists.
  await db.execute(sql`
  INSERT INTO "homepage_news_modules" ("_order", "_parent_id", "id", "heading", "section_id", "count", "enabled")
  SELECT row_number() OVER (PARTITION BY h."id" ORDER BY v."ord"), h."id", md5(random()::text || clock_timestamp()::text || v."slug"), v."heading", s."id", 5, true
  FROM "homepage" h
  CROSS JOIN (VALUES (1, 'local-news', 'Local News'), (2, 'music-arts', 'Music & Arts'), (3, 'florida-news', 'Florida News')) AS v("ord", "slug", "heading")
  JOIN "sections" s ON s."slug" = v."slug"
  WHERE NOT EXISTS (SELECT 1 FROM "homepage_news_modules" m WHERE m."_parent_id" = h."id");`)

  await db.execute(sql`
  ALTER TABLE "homepage" DROP COLUMN "local_news_heading";
  ALTER TABLE "homepage" DROP COLUMN "local_news_section_id";
  ALTER TABLE "homepage" DROP COLUMN "local_news_count";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "homepage" ADD COLUMN "local_news_heading" varchar DEFAULT 'Northwest Florida';
  ALTER TABLE "homepage" ADD COLUMN "local_news_section_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "local_news_count" numeric DEFAULT 6;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_local_news_section_id_sections_id_fk" FOREIGN KEY ("local_news_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "homepage_local_news_local_news_section_idx" ON "homepage" USING btree ("local_news_section_id");
`)

  // The first news section goes back into the single "Local news" list; the others are dropped with their table.
  await db.execute(sql`
  UPDATE "homepage" h
  SET "local_news_heading" = m."heading", "local_news_section_id" = m."section_id", "local_news_count" = m."count"
  FROM (SELECT DISTINCT ON ("_parent_id") * FROM "homepage_news_modules" ORDER BY "_parent_id", "_order") m
  WHERE m."_parent_id" = h."id";`)

  await db.execute(sql`
  ALTER TABLE "homepage_news_modules" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "placements_home_rail" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "placements_home_band" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "placements" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "homepage_news_modules" CASCADE;
  DROP TABLE "placements_home_rail" CASCADE;
  DROP TABLE "placements_home_band" CASCADE;
  DROP TABLE "placements" CASCADE;
    DROP TYPE "public"."enum_placements_home_rail_kind";
  DROP TYPE "public"."enum_placements_home_band_kind";`)
}
