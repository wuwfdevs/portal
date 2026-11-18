import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Placements become records editors make, instead of two fixed lists in a global.
 *
 * The `placement-items` collection holds one message each (zone, kind, sponsor, picture, link, dates, order and, for the list pages, which sections,
 * topics or reporters it appears on). This migration creates it, copies the home page rail and banner into it in the same order (spacing `order` by ten),
 * finds or makes each sponsor in the Sponsors list from the name the old tile carried in plain text, and drops the old `placements` global.
 * `down` puts the rail (at most ten) and the banner (one) back.
 *
 * Plain SQL, not the Local API (see `giving_form_addresses`): a migration that writes through the Local API reads the *current* schema and breaks on a
 * fresh database once a later migration touches the same tables. It was generated in two steps (add, then drop) because Drizzle asks, interactively,
 * whether new tables are renames of dropped ones.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_placement_items_kind" AS ENUM('sponsor', 'house');
  CREATE TYPE "public"."enum_placement_items_zone" AS ENUM('home.rail', 'home.band', 'list.rail');
  CREATE TYPE "public"."enum_placement_items_scope" AS ENUM('chosen', 'all');
  CREATE TABLE "placement_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_placement_items_kind" DEFAULT 'house' NOT NULL,
  	"sponsor_id" integer,
  	"zone" "enum_placement_items_zone" NOT NULL,
  	"image_id" integer NOT NULL,
  	"phone_image_id" integer,
  	"alt" varchar NOT NULL,
  	"href" varchar NOT NULL,
  	"scope" "enum_placement_items_scope" DEFAULT 'chosen',
  	"include_latest" boolean DEFAULT false,
  	"order" numeric DEFAULT 100,
  	"run_from" timestamp(3) with time zone,
  	"run_until" timestamp(3) with time zone,
  	"enabled" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "placement_items_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" integer,
  	"categories_id" integer,
  	"contributors_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "placement_items_id" integer;
  ALTER TABLE "placement_items" ADD CONSTRAINT "placement_items_sponsor_id_sponsors_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."sponsors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placement_items" ADD CONSTRAINT "placement_items_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placement_items" ADD CONSTRAINT "placement_items_phone_image_id_media_id_fk" FOREIGN KEY ("phone_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placement_items_rels" ADD CONSTRAINT "placement_items_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."placement_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "placement_items_rels" ADD CONSTRAINT "placement_items_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "placement_items_rels" ADD CONSTRAINT "placement_items_rels_categories_fk" FOREIGN KEY ("categories_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "placement_items_rels" ADD CONSTRAINT "placement_items_rels_contributors_fk" FOREIGN KEY ("contributors_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "placement_items_sponsor_idx" ON "placement_items" USING btree ("sponsor_id");
  CREATE INDEX "placement_items_image_idx" ON "placement_items" USING btree ("image_id");
  CREATE INDEX "placement_items_phone_image_idx" ON "placement_items" USING btree ("phone_image_id");
  CREATE INDEX "placement_items_updated_at_idx" ON "placement_items" USING btree ("updated_at");
  CREATE INDEX "placement_items_created_at_idx" ON "placement_items" USING btree ("created_at");
  CREATE INDEX "placement_items_rels_order_idx" ON "placement_items_rels" USING btree ("order");
  CREATE INDEX "placement_items_rels_parent_idx" ON "placement_items_rels" USING btree ("parent_id");
  CREATE INDEX "placement_items_rels_path_idx" ON "placement_items_rels" USING btree ("path");
  CREATE INDEX "placement_items_rels_sections_id_idx" ON "placement_items_rels" USING btree ("sections_id");
  CREATE INDEX "placement_items_rels_categories_id_idx" ON "placement_items_rels" USING btree ("categories_id");
  CREATE INDEX "placement_items_rels_contributors_id_idx" ON "placement_items_rels" USING btree ("contributors_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_placement_items_fk" FOREIGN KEY ("placement_items_id") REFERENCES "public"."placement_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_placement_items_id_idx" ON "payload_locked_documents_rels" USING btree ("placement_items_id");`)

  await db.execute(sql`
  -- Sponsors named on the old tiles that are not in the Sponsors list yet (an old tile named its sponsor in plain text).
  WITH names AS (
    SELECT DISTINCT trim(t."sponsor") AS n FROM (SELECT "sponsor", "kind"::text AS "kind" FROM "placements_home_rail" UNION ALL SELECT "sponsor", "kind"::text FROM "placements_home_band") t
    WHERE t."kind" = 'sponsor' AND trim(coalesce(t."sponsor", '')) <> ''
  ), missing AS (
    SELECT n, coalesce(nullif(lower(regexp_replace(regexp_replace(n, '[^A-Za-z0-9]+', '-', 'g'), '(^-+|-+$)', '', 'g')), ''), 'sponsor') AS base
    FROM names WHERE NOT EXISTS (SELECT 1 FROM "sponsors" s WHERE s."name" = names.n)
  )
  INSERT INTO "sponsors" ("name", "slug", "updated_at", "created_at")
  SELECT n, CASE WHEN EXISTS (SELECT 1 FROM "sponsors" s WHERE s."slug" = base) OR count(*) OVER (PARTITION BY base) > 1 THEN base || '-' || substr(md5(n), 1, 6) ELSE base END, now(), now()
  FROM missing;

  -- The old rail and banner become placements, in the same order (spaced by ten so one can be slotted between two).
  INSERT INTO "placement_items" ("name", "kind", "sponsor_id", "zone", "image_id", "alt", "href", "scope", "order", "run_from", "run_until", "enabled", "updated_at", "created_at")
  SELECT left(coalesce(nullif(trim(r."sponsor"), ''), r."alt") || ': home page rail', 120), r."kind"::text::"enum_placement_items_kind",
         (SELECT s."id" FROM "sponsors" s WHERE s."name" = trim(r."sponsor") ORDER BY s."id" LIMIT 1), 'home.rail', r."image_id", r."alt", r."href", 'chosen', r."_order" * 10,
         r."run_from", r."run_until", coalesce(r."enabled", true), now(), now() + (r."_order" * interval '1 millisecond')
  FROM "placements_home_rail" r WHERE r."image_id" IS NOT NULL;

  INSERT INTO "placement_items" ("name", "kind", "sponsor_id", "zone", "image_id", "phone_image_id", "alt", "href", "scope", "order", "run_from", "run_until", "enabled", "updated_at", "created_at")
  SELECT left(coalesce(nullif(trim(b."sponsor"), ''), b."alt") || ': home page banner', 120), b."kind"::text::"enum_placement_items_kind",
         (SELECT s."id" FROM "sponsors" s WHERE s."name" = trim(b."sponsor") ORDER BY s."id" LIMIT 1), 'home.band', b."image_id", b."phone_image_id", b."alt", b."href", 'chosen', b."_order" * 10,
         b."run_from", b."run_until", coalesce(b."enabled", true), now(), now() + (b."_order" * interval '1 millisecond')
  FROM "placements_home_band" b WHERE b."image_id" IS NOT NULL;`)

  await db.execute(sql`
   DROP TABLE "placements_home_rail" CASCADE;
  DROP TABLE "placements_home_band" CASCADE;
  DROP TABLE "placements" CASCADE;
  DROP TYPE "public"."enum_placements_home_rail_kind";
  DROP TYPE "public"."enum_placements_home_band_kind";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_placements_home_rail_kind" AS ENUM('sponsor', 'house');
  CREATE TYPE "public"."enum_placements_home_band_kind" AS ENUM('sponsor', 'house');
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
  
  ALTER TABLE "placements_home_rail" ADD CONSTRAINT "placements_home_rail_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placements_home_rail" ADD CONSTRAINT "placements_home_rail_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "placements_home_band" ADD CONSTRAINT "placements_home_band_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placements_home_band" ADD CONSTRAINT "placements_home_band_phone_image_id_media_id_fk" FOREIGN KEY ("phone_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "placements_home_band" ADD CONSTRAINT "placements_home_band_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "placements_home_rail_order_idx" ON "placements_home_rail" USING btree ("_order");
  CREATE INDEX "placements_home_rail_parent_id_idx" ON "placements_home_rail" USING btree ("_parent_id");
  CREATE INDEX "placements_home_rail_image_idx" ON "placements_home_rail" USING btree ("image_id");
  CREATE INDEX "placements_home_band_order_idx" ON "placements_home_band" USING btree ("_order");
  CREATE INDEX "placements_home_band_parent_id_idx" ON "placements_home_band" USING btree ("_parent_id");
  CREATE INDEX "placements_home_band_image_idx" ON "placements_home_band" USING btree ("image_id");
  CREATE INDEX "placements_home_band_phone_image_idx" ON "placements_home_band" USING btree ("phone_image_id");`)

  await db.execute(sql`
  -- The rail (at most ten) and the banner (one) go back to the old global, in order, with each sponsor's name as plain text again.
  INSERT INTO "placements" ("updated_at", "created_at") SELECT now(), now() WHERE EXISTS (SELECT 1 FROM "placement_items" WHERE "zone" IN ('home.rail', 'home.band'));

  INSERT INTO "placements_home_rail" ("_order", "_parent_id", "id", "kind", "sponsor", "image_id", "alt", "href", "run_from", "run_until", "enabled")
  SELECT row_number() OVER (ORDER BY i."order", i."id"), (SELECT min("id") FROM "placements"), md5(random()::text || i."id"::text), i."kind"::text::"enum_placements_home_rail_kind",
         (SELECT s."name" FROM "sponsors" s WHERE s."id" = i."sponsor_id"), i."image_id", i."alt", i."href", i."run_from", i."run_until", coalesce(i."enabled", true)
  FROM (SELECT * FROM "placement_items" WHERE "zone" = 'home.rail' ORDER BY "order", "id" LIMIT 10) i;

  INSERT INTO "placements_home_band" ("_order", "_parent_id", "id", "kind", "sponsor", "image_id", "phone_image_id", "alt", "href", "run_from", "run_until", "enabled")
  SELECT 1, (SELECT min("id") FROM "placements"), md5(random()::text || i."id"::text), i."kind"::text::"enum_placements_home_band_kind",
         (SELECT s."name" FROM "sponsors" s WHERE s."id" = i."sponsor_id"), i."image_id", i."phone_image_id", i."alt", i."href", i."run_from", i."run_until", coalesce(i."enabled", true)
  FROM (SELECT * FROM "placement_items" WHERE "zone" = 'home.band' ORDER BY "order", "id" LIMIT 1) i;`)

  await db.execute(sql`
   ALTER TABLE "placement_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "placement_items_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "placement_items" CASCADE;
  DROP TABLE "placement_items_rels" CASCADE;
  -- (dropping the table above with CASCADE has already removed this constraint)
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_placement_items_fk";
  
  DROP INDEX "payload_locked_documents_rels_placement_items_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "placement_items_id";
  DROP TYPE "public"."enum_placement_items_kind";
  DROP TYPE "public"."enum_placement_items_zone";
  DROP TYPE "public"."enum_placement_items_scope";`)
}
