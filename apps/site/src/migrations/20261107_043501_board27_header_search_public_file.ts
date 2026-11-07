import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Board 27: header items and buttons, search kinds and dates, and the footer's public file fields.
 *
 * Transition (2026-11-07): an earlier version of this change, migration 20261107_042509_board27_menus_search_public_file,
 * was applied to the staging database by a preview build and then replaced by this one before it reached production.
 * Its search and footer objects are exactly the ones created here; only its header tables (`header_menus`) differ. Where
 * it is recorded, its header tables are removed, its record is deleted, and only this migration's header part runs, so
 * search rows keep their links to shows and clips. Everywhere else (production, fresh installs) that step does nothing.
 */
const REPLACED = '20261107_042509_board27_menus_search_public_file'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  const found = await db.execute(sql`SELECT 1 FROM "payload_migrations" WHERE "name" = ${REPLACED} LIMIT 1;`)
  const replacing = (found as { rows?: unknown[] }).rows?.length ? true : false

  if (replacing) {
    await db.execute(sql`
  DROP TABLE IF EXISTS "header_menus_links" CASCADE;
  DROP TABLE IF EXISTS "header_menus" CASCADE;
  DROP TYPE IF EXISTS "public"."enum_header_menus_links_link_type";`)
    // A statement with a parameter must run on its own (a prepared statement holds one command).
    await db.execute(sql`DELETE FROM "payload_migrations" WHERE "name" = ${REPLACED};`)
  }

  // The header: items that are links or menus, and the buttons on the right.
  await db.execute(sql`
   CREATE TYPE "public"."enum_header_nav_items_links_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_header_nav_items_kind" AS ENUM('link', 'menu');
  CREATE TABLE "header_nav_items_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "enum_header_nav_items_links_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar
  );
  ALTER TABLE "header_nav_items" ALTER COLUMN "link_label" DROP NOT NULL;
  ALTER TABLE "header_nav_items" ADD COLUMN "kind" "enum_header_nav_items_kind" DEFAULT 'link' NOT NULL;
  ALTER TABLE "header_nav_items" ADD COLUMN "label" varchar;
  ALTER TABLE "header_nav_items" ADD COLUMN "heading" varchar;
  ALTER TABLE "header_nav_items" ADD COLUMN "blurb" varchar;
  ALTER TABLE "header" ADD COLUMN "actions_search_show" boolean DEFAULT true;
  ALTER TABLE "header" ADD COLUMN "actions_search_label" varchar DEFAULT 'Search';
  ALTER TABLE "header" ADD COLUMN "actions_sign_in_show" boolean DEFAULT true;
  ALTER TABLE "header" ADD COLUMN "actions_sign_in_label" varchar DEFAULT 'Sign in';
  ALTER TABLE "header" ADD COLUMN "actions_donate_show" boolean DEFAULT true;
  ALTER TABLE "header" ADD COLUMN "actions_donate_label" varchar DEFAULT 'Donate';
  ALTER TABLE "header" ADD COLUMN "actions_donate_href" varchar DEFAULT '/support';
  ALTER TABLE "header_nav_items_links" ADD CONSTRAINT "header_nav_items_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "header_nav_items_links_order_idx" ON "header_nav_items_links" USING btree ("_order");
  CREATE INDEX "header_nav_items_links_parent_id_idx" ON "header_nav_items_links" USING btree ("_parent_id");`)

  // Search kinds and dates, and the footer's public file fields: already in place where the replaced migration ran.
  if (!replacing) {
    await db.execute(sql`
   CREATE TYPE "public"."enum_search_kind" AS ENUM('story', 'live', 'episode', 'show', 'program', 'video');
  ALTER TABLE "search" ADD COLUMN "kind" "enum_search_kind";
  ALTER TABLE "search" ADD COLUMN "published_at" timestamp(3) with time zone;
  ALTER TABLE "search_rels" ADD COLUMN "productions_id" integer;
  ALTER TABLE "search_rels" ADD COLUMN "clips_id" integer;
  ALTER TABLE "footer" ADD COLUMN "public_file_url" varchar;
  ALTER TABLE "footer" ADD COLUMN "public_file_label" varchar DEFAULT 'FCC Public File' NOT NULL;
  ALTER TABLE "footer" ADD COLUMN "public_file_accessibility_contact" varchar;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_productions_fk" FOREIGN KEY ("productions_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_clips_fk" FOREIGN KEY ("clips_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "search_kind_idx" ON "search" USING btree ("kind");
  CREATE INDEX "search_published_at_idx" ON "search" USING btree ("published_at");
  CREATE INDEX "search_rels_productions_id_idx" ON "search_rels" USING btree ("productions_id");
  CREATE INDEX "search_rels_clips_id_idx" ON "search_rels" USING btree ("clips_id");`)
  }

  // Everything already in the index gets its kind and date from its own record, as search/beforeSync.ts would set them,
  // so the filters work before any reindex. Shows and clips not yet indexed enter on their next save, or all at once
  // with the search collection's Reindex button in the admin.
  await db.execute(sql`
  UPDATE "search" AS s
  SET "kind" = (CASE
      WHEN p."format" = 'live' THEN 'live'
      WHEN p."format" = 'audio' AND p."production_id" IS NOT NULL THEN 'episode'
      ELSE 'story'
    END)::"enum_search_kind",
    "published_at" = p."published_at"
  FROM "search_rels" AS r
  JOIN "posts" AS p ON p."id" = r."posts_id"
  WHERE r."parent_id" = s."id" AND r."path" = 'doc';
  UPDATE "search" AS s
  SET "kind" = (CASE WHEN pr."kind" = 'syndicated' THEN 'program' ELSE 'show' END)::"enum_search_kind",
    "published_at" = NULL
  FROM "search_rels" AS r
  JOIN "productions" AS pr ON pr."id" = r."productions_id"
  WHERE r."parent_id" = s."id" AND r."path" = 'doc';
  UPDATE "search" AS s
  SET "kind" = 'video'::"enum_search_kind",
    "published_at" = c."published_at"
  FROM "search_rels" AS r
  JOIN "clips" AS c ON c."id" = r."clips_id"
  WHERE r."parent_id" = s."id" AND r."path" = 'doc';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "header_nav_items_links" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "header_nav_items_links" CASCADE;
  ALTER TABLE "search_rels" DROP CONSTRAINT "search_rels_productions_fk";
  
  ALTER TABLE "search_rels" DROP CONSTRAINT "search_rels_clips_fk";
  
  DROP INDEX "search_kind_idx";
  DROP INDEX "search_published_at_idx";
  DROP INDEX "search_rels_productions_id_idx";
  DROP INDEX "search_rels_clips_id_idx";
  DELETE FROM "header_nav_items" WHERE "kind" = 'menu';
  ALTER TABLE "header_nav_items" ALTER COLUMN "link_label" SET NOT NULL;
  ALTER TABLE "search" DROP COLUMN "kind";
  ALTER TABLE "search" DROP COLUMN "published_at";
  ALTER TABLE "search_rels" DROP COLUMN "productions_id";
  ALTER TABLE "search_rels" DROP COLUMN "clips_id";
  ALTER TABLE "header_nav_items" DROP COLUMN "kind";
  ALTER TABLE "header_nav_items" DROP COLUMN "label";
  ALTER TABLE "header_nav_items" DROP COLUMN "heading";
  ALTER TABLE "header_nav_items" DROP COLUMN "blurb";
  ALTER TABLE "header" DROP COLUMN "actions_search_show";
  ALTER TABLE "header" DROP COLUMN "actions_search_label";
  ALTER TABLE "header" DROP COLUMN "actions_sign_in_show";
  ALTER TABLE "header" DROP COLUMN "actions_sign_in_label";
  ALTER TABLE "header" DROP COLUMN "actions_donate_show";
  ALTER TABLE "header" DROP COLUMN "actions_donate_label";
  ALTER TABLE "header" DROP COLUMN "actions_donate_href";
  ALTER TABLE "footer" DROP COLUMN "public_file_url";
  ALTER TABLE "footer" DROP COLUMN "public_file_label";
  ALTER TABLE "footer" DROP COLUMN "public_file_accessibility_contact";
  DROP TYPE "public"."enum_search_kind";
  DROP TYPE "public"."enum_header_nav_items_links_link_type";
  DROP TYPE "public"."enum_header_nav_items_kind";`)
}
