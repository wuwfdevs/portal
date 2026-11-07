import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_search_kind" AS ENUM('story', 'live', 'episode', 'show', 'program', 'video');
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
  ALTER TABLE "search" ADD COLUMN "kind" "enum_search_kind";
  ALTER TABLE "search" ADD COLUMN "published_at" timestamp(3) with time zone;
  ALTER TABLE "search_rels" ADD COLUMN "productions_id" integer;
  ALTER TABLE "search_rels" ADD COLUMN "clips_id" integer;
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
  ALTER TABLE "footer" ADD COLUMN "public_file_url" varchar;
  ALTER TABLE "footer" ADD COLUMN "public_file_label" varchar DEFAULT 'FCC Public File' NOT NULL;
  ALTER TABLE "footer" ADD COLUMN "public_file_accessibility_contact" varchar;
  ALTER TABLE "header_nav_items_links" ADD CONSTRAINT "header_nav_items_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header_nav_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "header_nav_items_links_order_idx" ON "header_nav_items_links" USING btree ("_order");
  CREATE INDEX "header_nav_items_links_parent_id_idx" ON "header_nav_items_links" USING btree ("_parent_id");
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_productions_fk" FOREIGN KEY ("productions_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "search_rels" ADD CONSTRAINT "search_rels_clips_fk" FOREIGN KEY ("clips_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "search_kind_idx" ON "search" USING btree ("kind");
  CREATE INDEX "search_published_at_idx" ON "search" USING btree ("published_at");
  CREATE INDEX "search_rels_productions_id_idx" ON "search_rels" USING btree ("productions_id");
  CREATE INDEX "search_rels_clips_id_idx" ON "search_rels" USING btree ("clips_id");`)

  // Stories already in the index get their kind and date from the story, as search/beforeSync.ts would set them, so
  // the Stories and Shows filters find them before any reindex. Shows and short video enter the index on their next
  // save, or all at once with the search collection's Reindex button in the admin.
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
  WHERE r."parent_id" = s."id" AND r."path" = 'doc';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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
