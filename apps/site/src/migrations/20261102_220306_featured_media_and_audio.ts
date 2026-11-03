import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_blocks_media_block_alignment" AS ENUM('full', 'center', 'left', 'right');
  CREATE TYPE "public"."enum__pages_v_blocks_media_block_alignment" AS ENUM('full', 'center', 'left', 'right');
  CREATE TYPE "public"."enum_posts_blocks_media_block_alignment" AS ENUM('full', 'center', 'left', 'right');
  CREATE TYPE "public"."enum_posts_blocks_gallery_layout" AS ENUM('carousel', 'grid', 'list');
  CREATE TYPE "public"."enum__posts_v_blocks_media_block_alignment" AS ENUM('full', 'center', 'left', 'right');
  CREATE TYPE "public"."enum__posts_v_blocks_gallery_layout" AS ENUM('carousel', 'grid', 'list');
  CREATE TABLE "posts_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"caption" varchar,
  	"credit" varchar,
  	"source" varchar,
  	"alt_text" varchar,
  	"alignment" "enum_posts_blocks_media_block_alignment" DEFAULT 'full',
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_gallery_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"credit" varchar
  );
  
  CREATE TABLE "posts_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"layout" "enum_posts_blocks_gallery_layout" DEFAULT 'carousel',
  	"block_name" varchar
  );
  
  CREATE TABLE "posts_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"title" varchar,
  	"width" numeric,
  	"height" numeric,
  	"caption" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"caption" varchar,
  	"credit" varchar,
  	"source" varchar,
  	"alt_text" varchar,
  	"alignment" "enum__posts_v_blocks_media_block_alignment" DEFAULT 'full',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_gallery_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"credit" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"layout" "enum__posts_v_blocks_gallery_layout" DEFAULT 'carousel',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_embed" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"url" varchar,
  	"title" varchar,
  	"width" numeric,
  	"height" numeric,
  	"caption" varchar,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "audio" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"credit" varchar,
  	"duration_seconds" numeric,
  	"legacy_source_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "posts" DROP CONSTRAINT "posts_hero_image_id_media_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_hero_image_id_media_id_fk";
  
  DROP INDEX "posts_hero_image_idx";
  DROP INDEX "_posts_v_version_version_hero_image_idx";
  ALTER TABLE "pages_blocks_media_block" ADD COLUMN "caption" varchar;
  ALTER TABLE "pages_blocks_media_block" ADD COLUMN "credit" varchar;
  ALTER TABLE "pages_blocks_media_block" ADD COLUMN "source" varchar;
  ALTER TABLE "pages_blocks_media_block" ADD COLUMN "alt_text" varchar;
  ALTER TABLE "pages_blocks_media_block" ADD COLUMN "alignment" "enum_pages_blocks_media_block_alignment" DEFAULT 'full';
  ALTER TABLE "_pages_v_blocks_media_block" ADD COLUMN "caption" varchar;
  ALTER TABLE "_pages_v_blocks_media_block" ADD COLUMN "credit" varchar;
  ALTER TABLE "_pages_v_blocks_media_block" ADD COLUMN "source" varchar;
  ALTER TABLE "_pages_v_blocks_media_block" ADD COLUMN "alt_text" varchar;
  ALTER TABLE "_pages_v_blocks_media_block" ADD COLUMN "alignment" "enum__pages_v_blocks_media_block_alignment" DEFAULT 'full';
  ALTER TABLE "posts" ADD COLUMN "featured_audio_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_featured_audio_id" integer;
  ALTER TABLE "media" ADD COLUMN "credit" varchar;
  ALTER TABLE "media" ADD COLUMN "source" varchar;
  ALTER TABLE "media" ADD COLUMN "legacy_source_url" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audio_id" integer;
  ALTER TABLE "posts_blocks_media_block" ADD CONSTRAINT "posts_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_media_block" ADD CONSTRAINT "posts_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_gallery_images" ADD CONSTRAINT "posts_blocks_gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_gallery_images" ADD CONSTRAINT "posts_blocks_gallery_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_gallery" ADD CONSTRAINT "posts_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "posts_blocks_embed" ADD CONSTRAINT "posts_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_media_block" ADD CONSTRAINT "_posts_v_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_media_block" ADD CONSTRAINT "_posts_v_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_gallery_images" ADD CONSTRAINT "_posts_v_blocks_gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_gallery_images" ADD CONSTRAINT "_posts_v_blocks_gallery_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_gallery" ADD CONSTRAINT "_posts_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_embed" ADD CONSTRAINT "_posts_v_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_blocks_media_block_order_idx" ON "posts_blocks_media_block" USING btree ("_order");
  CREATE INDEX "posts_blocks_media_block_parent_id_idx" ON "posts_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_media_block_path_idx" ON "posts_blocks_media_block" USING btree ("_path");
  CREATE INDEX "posts_blocks_media_block_media_idx" ON "posts_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "posts_blocks_gallery_images_order_idx" ON "posts_blocks_gallery_images" USING btree ("_order");
  CREATE INDEX "posts_blocks_gallery_images_parent_id_idx" ON "posts_blocks_gallery_images" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_gallery_images_image_idx" ON "posts_blocks_gallery_images" USING btree ("image_id");
  CREATE INDEX "posts_blocks_gallery_order_idx" ON "posts_blocks_gallery" USING btree ("_order");
  CREATE INDEX "posts_blocks_gallery_parent_id_idx" ON "posts_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_gallery_path_idx" ON "posts_blocks_gallery" USING btree ("_path");
  CREATE INDEX "posts_blocks_embed_order_idx" ON "posts_blocks_embed" USING btree ("_order");
  CREATE INDEX "posts_blocks_embed_parent_id_idx" ON "posts_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_embed_path_idx" ON "posts_blocks_embed" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_media_block_order_idx" ON "_posts_v_blocks_media_block" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_media_block_parent_id_idx" ON "_posts_v_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_media_block_path_idx" ON "_posts_v_blocks_media_block" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_media_block_media_idx" ON "_posts_v_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "_posts_v_blocks_gallery_images_order_idx" ON "_posts_v_blocks_gallery_images" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_gallery_images_parent_id_idx" ON "_posts_v_blocks_gallery_images" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_gallery_images_image_idx" ON "_posts_v_blocks_gallery_images" USING btree ("image_id");
  CREATE INDEX "_posts_v_blocks_gallery_order_idx" ON "_posts_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_gallery_parent_id_idx" ON "_posts_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_gallery_path_idx" ON "_posts_v_blocks_gallery" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_embed_order_idx" ON "_posts_v_blocks_embed" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_embed_parent_id_idx" ON "_posts_v_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_embed_path_idx" ON "_posts_v_blocks_embed" USING btree ("_path");
  CREATE INDEX "audio_title_idx" ON "audio" USING btree ("title");
  CREATE INDEX "audio_credit_idx" ON "audio" USING btree ("credit");
  CREATE UNIQUE INDEX "audio_legacy_legacy_source_url_idx" ON "audio" USING btree ("legacy_source_url");
  CREATE INDEX "audio_updated_at_idx" ON "audio" USING btree ("updated_at");
  CREATE INDEX "audio_created_at_idx" ON "audio" USING btree ("created_at");
  CREATE UNIQUE INDEX "audio_filename_idx" ON "audio" USING btree ("filename");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_featured_audio_id_audio_id_fk" FOREIGN KEY ("featured_audio_id") REFERENCES "public"."audio"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_featured_audio_id_audio_id_fk" FOREIGN KEY ("version_featured_audio_id") REFERENCES "public"."audio"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audio_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."audio"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_featured_audio_idx" ON "posts" USING btree ("featured_audio_id");
  CREATE INDEX "_posts_v_version_version_featured_audio_idx" ON "_posts_v" USING btree ("version_featured_audio_id");
  CREATE INDEX "media_alt_idx" ON "media" USING btree ("alt");
  CREATE INDEX "media_credit_idx" ON "media" USING btree ("credit");
  CREATE UNIQUE INDEX "media_legacy_legacy_source_url_idx" ON "media" USING btree ("legacy_source_url");
  CREATE INDEX "payload_locked_documents_rels_audio_id_idx" ON "payload_locked_documents_rels" USING btree ("audio_id");
`)

  // The story hero image becomes the story's featured media (a single picture). Copy before the old columns go, for
  // the published stories and for every saved version, so nothing that was on a page disappears.
  await db.execute(sql`
  INSERT INTO "posts_blocks_media_block" ("_order", "_parent_id", "_path", "id", "media_id", "alignment")
  SELECT 1, "id", 'featuredMedia', substr(md5(random()::text || clock_timestamp()::text || "id"::text), 1, 24), "hero_image_id", 'full'
  FROM "posts" WHERE "hero_image_id" IS NOT NULL;
  INSERT INTO "_posts_v_blocks_media_block" ("_order", "_parent_id", "_path", "media_id", "alignment", "_uuid")
  SELECT 1, "id", 'version.featuredMedia', "version_hero_image_id", 'full', substr(md5(random()::text || clock_timestamp()::text || "id"::text), 1, 24)
  FROM "_posts_v" WHERE "version_hero_image_id" IS NOT NULL;`)

  await db.execute(sql`
  ALTER TABLE "posts" DROP COLUMN "hero_image_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_hero_image_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Put the hero image back from each story's first featured picture before the featured media tables are dropped.
  // (A featured gallery or video has no equivalent on the old field and is lost on rollback.)
  await db.execute(sql`
  ALTER TABLE "posts" ADD COLUMN "hero_image_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_hero_image_id" integer;
  UPDATE "posts" SET "hero_image_id" = (
    SELECT b."media_id" FROM "posts_blocks_media_block" b
    WHERE b."_parent_id" = "posts"."id" AND b."_path" = 'featuredMedia' ORDER BY b."_order" LIMIT 1);
  UPDATE "_posts_v" SET "version_hero_image_id" = (
    SELECT b."media_id" FROM "_posts_v_blocks_media_block" b
    WHERE b."_parent_id" = "_posts_v"."id" AND b."_path" = 'version.featuredMedia' ORDER BY b."_order" LIMIT 1);`)

  await db.execute(sql`
   ALTER TABLE "posts_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_gallery_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_gallery_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "audio" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_blocks_media_block" CASCADE;
  DROP TABLE "posts_blocks_gallery_images" CASCADE;
  DROP TABLE "posts_blocks_gallery" CASCADE;
  DROP TABLE "posts_blocks_embed" CASCADE;
  DROP TABLE "_posts_v_blocks_media_block" CASCADE;
  DROP TABLE "_posts_v_blocks_gallery_images" CASCADE;
  DROP TABLE "_posts_v_blocks_gallery" CASCADE;
  DROP TABLE "_posts_v_blocks_embed" CASCADE;
  -- Dropping the audio table also drops the foreign keys that point at it, so the drops below are IF EXISTS.
  DROP TABLE "audio" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_featured_audio_id_audio_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT IF EXISTS "_posts_v_version_featured_audio_id_audio_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_audio_fk";
  
  DROP INDEX "posts_featured_audio_idx";
  DROP INDEX "_posts_v_version_version_featured_audio_idx";
  DROP INDEX "media_alt_idx";
  DROP INDEX "media_credit_idx";
  DROP INDEX "media_legacy_legacy_source_url_idx";
  DROP INDEX "payload_locked_documents_rels_audio_id_idx";
  ALTER TABLE "posts" ADD CONSTRAINT "posts_hero_image_id_media_id_fk" FOREIGN KEY ("hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_hero_image_id_media_id_fk" FOREIGN KEY ("version_hero_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_hero_image_idx" ON "posts" USING btree ("hero_image_id");
  CREATE INDEX "_posts_v_version_version_hero_image_idx" ON "_posts_v" USING btree ("version_hero_image_id");
  ALTER TABLE "pages_blocks_media_block" DROP COLUMN "caption";
  ALTER TABLE "pages_blocks_media_block" DROP COLUMN "credit";
  ALTER TABLE "pages_blocks_media_block" DROP COLUMN "source";
  ALTER TABLE "pages_blocks_media_block" DROP COLUMN "alt_text";
  ALTER TABLE "pages_blocks_media_block" DROP COLUMN "alignment";
  ALTER TABLE "_pages_v_blocks_media_block" DROP COLUMN "caption";
  ALTER TABLE "_pages_v_blocks_media_block" DROP COLUMN "credit";
  ALTER TABLE "_pages_v_blocks_media_block" DROP COLUMN "source";
  ALTER TABLE "_pages_v_blocks_media_block" DROP COLUMN "alt_text";
  ALTER TABLE "_pages_v_blocks_media_block" DROP COLUMN "alignment";
  ALTER TABLE "posts" DROP COLUMN "featured_audio_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_featured_audio_id";
  ALTER TABLE "media" DROP COLUMN "credit";
  ALTER TABLE "media" DROP COLUMN "source";
  ALTER TABLE "media" DROP COLUMN "legacy_source_url";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audio_id";
  DROP TYPE "public"."enum_pages_blocks_media_block_alignment";
  DROP TYPE "public"."enum__pages_v_blocks_media_block_alignment";
  DROP TYPE "public"."enum_posts_blocks_media_block_alignment";
  DROP TYPE "public"."enum_posts_blocks_gallery_layout";
  DROP TYPE "public"."enum__posts_v_blocks_media_block_alignment";
  DROP TYPE "public"."enum__posts_v_blocks_gallery_layout";`)
}
