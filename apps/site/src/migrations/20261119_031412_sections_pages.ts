/**
 * Pages built from sections: the `sections` template, the page set and theme, the sub-navigation fields, the no-index and no-referrer
 * switches, and the `sections` blocks field. Adds only; existing pages are unchanged. It runs BEFORE `blocks_to_json` on purpose: that
 * migration reads every page through Payload with the config as it is when it runs, so these columns must already exist. Generated with
 * `blocksAsJSON` off, so the blocks field is made as tables here and `blocks_to_json` then turns them into jsonb with the rest.
 * `down` turns pages on the sections template back into standard pages before removing the enum value, so it works on rows.
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_section_cards_tone" AS ENUM('plain', 'grey', 'accent', 'dark', 'teal', 'lime');
  CREATE TYPE "public"."enum_pages_page_set" AS ENUM('sponsor', 'giving', 'listens', 'voyager', 'unearthing', 'radiolive');
  CREATE TYPE "public"."enum_pages_theme" AS ENUM('wuwf');
  CREATE TYPE "public"."enum__pages_v_blocks_section_cards_tone" AS ENUM('plain', 'grey', 'accent', 'dark', 'teal', 'lime');
  CREATE TYPE "public"."enum__pages_v_version_page_set" AS ENUM('sponsor', 'giving', 'listens', 'voyager', 'unearthing', 'radiolive');
  CREATE TYPE "public"."enum__pages_v_version_theme" AS ENUM('wuwf');
  ALTER TYPE "public"."enum_pages_template" ADD VALUE 'sections';
  ALTER TYPE "public"."enum__pages_v_version_template" ADD VALUE 'sections';
  CREATE TABLE "pages_blocks_section_cards_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"tag" varchar,
  	"price" varchar,
  	"href" varchar,
  	"link_label" varchar
  );
  
  CREATE TABLE "pages_blocks_section_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"hidden" boolean DEFAULT false,
  	"anchor" varchar,
  	"tone" "enum_pages_blocks_section_cards_tone" DEFAULT 'plain',
  	"heading_eyebrow" varchar,
  	"heading_title" varchar,
  	"heading_intro" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_section_cards_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"tag" varchar,
  	"price" varchar,
  	"href" varchar,
  	"link_label" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_pages_v_blocks_section_cards" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"hidden" boolean DEFAULT false,
  	"anchor" varchar,
  	"tone" "enum__pages_v_blocks_section_cards_tone" DEFAULT 'plain',
  	"heading_eyebrow" varchar,
  	"heading_title" varchar,
  	"heading_intro" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "pages" ADD COLUMN "page_set" "enum_pages_page_set";
  ALTER TABLE "pages" ADD COLUMN "theme" "enum_pages_theme";
  ALTER TABLE "pages" ADD COLUMN "nav_label" varchar;
  ALTER TABLE "pages" ADD COLUMN "nav_order" numeric;
  ALTER TABLE "pages" ADD COLUMN "noindex" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN "no_referrer" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_page_set" "enum__pages_v_version_page_set";
  ALTER TABLE "_pages_v" ADD COLUMN "version_theme" "enum__pages_v_version_theme";
  ALTER TABLE "_pages_v" ADD COLUMN "version_nav_label" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_nav_order" numeric;
  ALTER TABLE "_pages_v" ADD COLUMN "version_noindex" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN "version_no_referrer" boolean DEFAULT false;
  ALTER TABLE "pages_blocks_section_cards_cards" ADD CONSTRAINT "pages_blocks_section_cards_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages_blocks_section_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pages_blocks_section_cards" ADD CONSTRAINT "pages_blocks_section_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section_cards_cards" ADD CONSTRAINT "_pages_v_blocks_section_cards_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v_blocks_section_cards"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_pages_v_blocks_section_cards" ADD CONSTRAINT "_pages_v_blocks_section_cards_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_pages_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "pages_blocks_section_cards_cards_order_idx" ON "pages_blocks_section_cards_cards" USING btree ("_order");
  CREATE INDEX "pages_blocks_section_cards_cards_parent_id_idx" ON "pages_blocks_section_cards_cards" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_section_cards_order_idx" ON "pages_blocks_section_cards" USING btree ("_order");
  CREATE INDEX "pages_blocks_section_cards_parent_id_idx" ON "pages_blocks_section_cards" USING btree ("_parent_id");
  CREATE INDEX "pages_blocks_section_cards_path_idx" ON "pages_blocks_section_cards" USING btree ("_path");
  CREATE INDEX "_pages_v_blocks_section_cards_cards_order_idx" ON "_pages_v_blocks_section_cards_cards" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_section_cards_cards_parent_id_idx" ON "_pages_v_blocks_section_cards_cards" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_section_cards_order_idx" ON "_pages_v_blocks_section_cards" USING btree ("_order");
  CREATE INDEX "_pages_v_blocks_section_cards_parent_id_idx" ON "_pages_v_blocks_section_cards" USING btree ("_parent_id");
  CREATE INDEX "_pages_v_blocks_section_cards_path_idx" ON "_pages_v_blocks_section_cards" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // A page on the new template cannot keep it once the enum value is gone (its sections go with the tables below), so it becomes a standard page.
  await db.execute(sql`
   UPDATE "pages" SET "template" = 'standard' WHERE "template" = 'sections';
  UPDATE "_pages_v" SET "version_template" = 'standard' WHERE "version_template" = 'sections';`)
  await db.execute(sql`
   DROP TABLE "pages_blocks_section_cards_cards" CASCADE;
  DROP TABLE "pages_blocks_section_cards" CASCADE;
  DROP TABLE "_pages_v_blocks_section_cards_cards" CASCADE;
  DROP TABLE "_pages_v_blocks_section_cards" CASCADE;
  ALTER TABLE "pages" ALTER COLUMN "template" SET DATA TYPE text;
  ALTER TABLE "pages" ALTER COLUMN "template" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum_pages_template";
  CREATE TYPE "public"."enum_pages_template" AS ENUM('standard', 'blocks');
  ALTER TABLE "pages" ALTER COLUMN "template" SET DEFAULT 'standard'::"public"."enum_pages_template";
  ALTER TABLE "pages" ALTER COLUMN "template" SET DATA TYPE "public"."enum_pages_template" USING "template"::"public"."enum_pages_template";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_template" SET DATA TYPE text;
  ALTER TABLE "_pages_v" ALTER COLUMN "version_template" SET DEFAULT 'standard'::text;
  DROP TYPE "public"."enum__pages_v_version_template";
  CREATE TYPE "public"."enum__pages_v_version_template" AS ENUM('standard', 'blocks');
  ALTER TABLE "_pages_v" ALTER COLUMN "version_template" SET DEFAULT 'standard'::"public"."enum__pages_v_version_template";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_template" SET DATA TYPE "public"."enum__pages_v_version_template" USING "version_template"::"public"."enum__pages_v_version_template";
  ALTER TABLE "pages" DROP COLUMN "page_set";
  ALTER TABLE "pages" DROP COLUMN "theme";
  ALTER TABLE "pages" DROP COLUMN "nav_label";
  ALTER TABLE "pages" DROP COLUMN "nav_order";
  ALTER TABLE "pages" DROP COLUMN "noindex";
  ALTER TABLE "pages" DROP COLUMN "no_referrer";
  ALTER TABLE "_pages_v" DROP COLUMN "version_page_set";
  ALTER TABLE "_pages_v" DROP COLUMN "version_theme";
  ALTER TABLE "_pages_v" DROP COLUMN "version_nav_label";
  ALTER TABLE "_pages_v" DROP COLUMN "version_nav_order";
  ALTER TABLE "_pages_v" DROP COLUMN "version_noindex";
  ALTER TABLE "_pages_v" DROP COLUMN "version_no_referrer";
  DROP TYPE "public"."enum_pages_blocks_section_cards_tone";
  DROP TYPE "public"."enum_pages_page_set";
  DROP TYPE "public"."enum_pages_theme";
  DROP TYPE "public"."enum__pages_v_blocks_section_cards_tone";
  DROP TYPE "public"."enum__pages_v_version_page_set";
  DROP TYPE "public"."enum__pages_v_version_theme";`)
}
