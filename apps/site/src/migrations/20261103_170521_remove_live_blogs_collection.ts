import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // The old live blog collection goes: live blogs are stories now (see the previous migration). Refuse to drop it if it holds
  // anything, so no live blog is ever lost silently. (None were ever imported.)
  await db.execute(sql`
   DO $$
  BEGIN
    IF to_regclass('public.live_posts') IS NOT NULL AND EXISTS (SELECT 1 FROM "live_posts") THEN
      RAISE EXCEPTION 'the old live blog collection still holds live blogs: move them to stories (format "live") or delete them first';
    END IF;
  END $$;`)
  await db.execute(sql`
   ALTER TABLE "live_posts_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts_blocks_gallery_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts_blocks_video_player" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "live_posts_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_blocks_gallery_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_blocks_video_player" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_live_posts_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "live_posts_blocks_media_block" CASCADE;
  DROP TABLE IF EXISTS "live_posts_blocks_gallery_images" CASCADE;
  DROP TABLE IF EXISTS "live_posts_blocks_gallery" CASCADE;
  DROP TABLE IF EXISTS "live_posts_blocks_video_player" CASCADE;
  DROP TABLE IF EXISTS "live_posts_blocks_embed" CASCADE;
  DROP TABLE IF EXISTS "live_posts" CASCADE;
  DROP TABLE IF EXISTS "live_posts_rels" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v_blocks_media_block" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v_blocks_gallery_images" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v_blocks_gallery" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v_blocks_video_player" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v_blocks_embed" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v" CASCADE;
  DROP TABLE IF EXISTS "_live_posts_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_live_posts_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_live_posts_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "live_posts_id";
  DROP TYPE IF EXISTS "public"."enum_live_posts_blocks_media_block_alignment";
  DROP TYPE IF EXISTS "public"."enum_live_posts_blocks_gallery_layout";
  DROP TYPE IF EXISTS "public"."enum_live_posts_coverage";
  DROP TYPE IF EXISTS "public"."enum_live_posts_status";
  DROP TYPE IF EXISTS "public"."enum__live_posts_v_blocks_media_block_alignment";
  DROP TYPE IF EXISTS "public"."enum__live_posts_v_blocks_gallery_layout";
  DROP TYPE IF EXISTS "public"."enum__live_posts_v_version_coverage";
  DROP TYPE IF EXISTS "public"."enum__live_posts_v_version_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_live_posts_blocks_media_block_alignment" AS ENUM('full', 'center', 'left', 'right');
  CREATE TYPE "public"."enum_live_posts_blocks_gallery_layout" AS ENUM('carousel', 'grid', 'list');
  CREATE TYPE "public"."enum_live_posts_coverage" AS ENUM('live', 'ended');
  CREATE TYPE "public"."enum_live_posts_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__live_posts_v_blocks_media_block_alignment" AS ENUM('full', 'center', 'left', 'right');
  CREATE TYPE "public"."enum__live_posts_v_blocks_gallery_layout" AS ENUM('carousel', 'grid', 'list');
  CREATE TYPE "public"."enum__live_posts_v_version_coverage" AS ENUM('live', 'ended');
  CREATE TYPE "public"."enum__live_posts_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "live_posts_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"caption" varchar,
  	"credit" varchar,
  	"source" varchar,
  	"alt_text" varchar,
  	"alignment" "enum_live_posts_blocks_media_block_alignment" DEFAULT 'full',
  	"block_name" varchar
  );
  
  CREATE TABLE "live_posts_blocks_gallery_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"credit" varchar
  );
  
  CREATE TABLE "live_posts_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"layout" "enum_live_posts_blocks_gallery_layout" DEFAULT 'carousel',
  	"block_name" varchar
  );
  
  CREATE TABLE "live_posts_blocks_video_player" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"poster_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "live_posts_blocks_embed" (
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
  
  CREATE TABLE "live_posts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar,
  	"coverage" "enum_live_posts_coverage" DEFAULT 'live',
  	"ended_at" timestamp(3) with time zone,
  	"description" varchar,
  	"intro" jsonb,
  	"legacy_legacy_path" varchar,
  	"legacy_grove_id" varchar,
  	"legacy_modified_at" timestamp(3) with time zone,
  	"legacy_started_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_live_posts_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "live_posts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"live_updates_id" integer
  );
  
  CREATE TABLE "_live_posts_v_blocks_media_block" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"media_id" integer,
  	"caption" varchar,
  	"credit" varchar,
  	"source" varchar,
  	"alt_text" varchar,
  	"alignment" "enum__live_posts_v_blocks_media_block_alignment" DEFAULT 'full',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_live_posts_v_blocks_gallery_images" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"image_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"credit" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_live_posts_v_blocks_gallery" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"description" varchar,
  	"layout" "enum__live_posts_v_blocks_gallery_layout" DEFAULT 'carousel',
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_live_posts_v_blocks_video_player" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"poster_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "_live_posts_v_blocks_embed" (
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
  
  CREATE TABLE "_live_posts_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_generate_slug" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_coverage" "enum__live_posts_v_version_coverage" DEFAULT 'live',
  	"version_ended_at" timestamp(3) with time zone,
  	"version_description" varchar,
  	"version_intro" jsonb,
  	"version_legacy_legacy_path" varchar,
  	"version_legacy_grove_id" varchar,
  	"version_legacy_modified_at" timestamp(3) with time zone,
  	"version_legacy_started_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__live_posts_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_live_posts_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"live_updates_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "live_posts_id" integer;
  ALTER TABLE "live_posts_blocks_media_block" ADD CONSTRAINT "live_posts_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_media_block" ADD CONSTRAINT "live_posts_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_gallery_images" ADD CONSTRAINT "live_posts_blocks_gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_gallery_images" ADD CONSTRAINT "live_posts_blocks_gallery_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_posts_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_gallery" ADD CONSTRAINT "live_posts_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_video_player" ADD CONSTRAINT "live_posts_blocks_video_player_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_video_player" ADD CONSTRAINT "live_posts_blocks_video_player_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_video_player" ADD CONSTRAINT "live_posts_blocks_video_player_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts_blocks_embed" ADD CONSTRAINT "live_posts_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts_rels" ADD CONSTRAINT "live_posts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_posts_rels" ADD CONSTRAINT "live_posts_rels_live_updates_fk" FOREIGN KEY ("live_updates_id") REFERENCES "public"."live_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_media_block" ADD CONSTRAINT "_live_posts_v_blocks_media_block_media_id_media_id_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_media_block" ADD CONSTRAINT "_live_posts_v_blocks_media_block_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_live_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_gallery_images" ADD CONSTRAINT "_live_posts_v_blocks_gallery_images_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_gallery_images" ADD CONSTRAINT "_live_posts_v_blocks_gallery_images_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_live_posts_v_blocks_gallery"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_gallery" ADD CONSTRAINT "_live_posts_v_blocks_gallery_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_live_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_video_player" ADD CONSTRAINT "_live_posts_v_blocks_video_player_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_video_player" ADD CONSTRAINT "_live_posts_v_blocks_video_player_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_video_player" ADD CONSTRAINT "_live_posts_v_blocks_video_player_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_live_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v_blocks_embed" ADD CONSTRAINT "_live_posts_v_blocks_embed_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_live_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v" ADD CONSTRAINT "_live_posts_v_parent_id_live_posts_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."live_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_live_posts_v_rels" ADD CONSTRAINT "_live_posts_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_live_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_live_posts_v_rels" ADD CONSTRAINT "_live_posts_v_rels_live_updates_fk" FOREIGN KEY ("live_updates_id") REFERENCES "public"."live_updates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "live_posts_blocks_media_block_order_idx" ON "live_posts_blocks_media_block" USING btree ("_order");
  CREATE INDEX "live_posts_blocks_media_block_parent_id_idx" ON "live_posts_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "live_posts_blocks_media_block_path_idx" ON "live_posts_blocks_media_block" USING btree ("_path");
  CREATE INDEX "live_posts_blocks_media_block_media_idx" ON "live_posts_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "live_posts_blocks_gallery_images_order_idx" ON "live_posts_blocks_gallery_images" USING btree ("_order");
  CREATE INDEX "live_posts_blocks_gallery_images_parent_id_idx" ON "live_posts_blocks_gallery_images" USING btree ("_parent_id");
  CREATE INDEX "live_posts_blocks_gallery_images_image_idx" ON "live_posts_blocks_gallery_images" USING btree ("image_id");
  CREATE INDEX "live_posts_blocks_gallery_order_idx" ON "live_posts_blocks_gallery" USING btree ("_order");
  CREATE INDEX "live_posts_blocks_gallery_parent_id_idx" ON "live_posts_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "live_posts_blocks_gallery_path_idx" ON "live_posts_blocks_gallery" USING btree ("_path");
  CREATE INDEX "live_posts_blocks_video_player_order_idx" ON "live_posts_blocks_video_player" USING btree ("_order");
  CREATE INDEX "live_posts_blocks_video_player_parent_id_idx" ON "live_posts_blocks_video_player" USING btree ("_parent_id");
  CREATE INDEX "live_posts_blocks_video_player_path_idx" ON "live_posts_blocks_video_player" USING btree ("_path");
  CREATE INDEX "live_posts_blocks_video_player_video_idx" ON "live_posts_blocks_video_player" USING btree ("video_id");
  CREATE INDEX "live_posts_blocks_video_player_poster_idx" ON "live_posts_blocks_video_player" USING btree ("poster_id");
  CREATE INDEX "live_posts_blocks_embed_order_idx" ON "live_posts_blocks_embed" USING btree ("_order");
  CREATE INDEX "live_posts_blocks_embed_parent_id_idx" ON "live_posts_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "live_posts_blocks_embed_path_idx" ON "live_posts_blocks_embed" USING btree ("_path");
  CREATE UNIQUE INDEX "live_posts_slug_idx" ON "live_posts" USING btree ("slug");
  CREATE UNIQUE INDEX "live_posts_legacy_legacy_legacy_path_idx" ON "live_posts" USING btree ("legacy_legacy_path");
  CREATE UNIQUE INDEX "live_posts_legacy_legacy_grove_id_idx" ON "live_posts" USING btree ("legacy_grove_id");
  CREATE INDEX "live_posts_updated_at_idx" ON "live_posts" USING btree ("updated_at");
  CREATE INDEX "live_posts_created_at_idx" ON "live_posts" USING btree ("created_at");
  CREATE INDEX "live_posts__status_idx" ON "live_posts" USING btree ("_status");
  CREATE INDEX "live_posts_rels_order_idx" ON "live_posts_rels" USING btree ("order");
  CREATE INDEX "live_posts_rels_parent_idx" ON "live_posts_rels" USING btree ("parent_id");
  CREATE INDEX "live_posts_rels_path_idx" ON "live_posts_rels" USING btree ("path");
  CREATE INDEX "live_posts_rels_live_updates_id_idx" ON "live_posts_rels" USING btree ("live_updates_id");
  CREATE INDEX "_live_posts_v_blocks_media_block_order_idx" ON "_live_posts_v_blocks_media_block" USING btree ("_order");
  CREATE INDEX "_live_posts_v_blocks_media_block_parent_id_idx" ON "_live_posts_v_blocks_media_block" USING btree ("_parent_id");
  CREATE INDEX "_live_posts_v_blocks_media_block_path_idx" ON "_live_posts_v_blocks_media_block" USING btree ("_path");
  CREATE INDEX "_live_posts_v_blocks_media_block_media_idx" ON "_live_posts_v_blocks_media_block" USING btree ("media_id");
  CREATE INDEX "_live_posts_v_blocks_gallery_images_order_idx" ON "_live_posts_v_blocks_gallery_images" USING btree ("_order");
  CREATE INDEX "_live_posts_v_blocks_gallery_images_parent_id_idx" ON "_live_posts_v_blocks_gallery_images" USING btree ("_parent_id");
  CREATE INDEX "_live_posts_v_blocks_gallery_images_image_idx" ON "_live_posts_v_blocks_gallery_images" USING btree ("image_id");
  CREATE INDEX "_live_posts_v_blocks_gallery_order_idx" ON "_live_posts_v_blocks_gallery" USING btree ("_order");
  CREATE INDEX "_live_posts_v_blocks_gallery_parent_id_idx" ON "_live_posts_v_blocks_gallery" USING btree ("_parent_id");
  CREATE INDEX "_live_posts_v_blocks_gallery_path_idx" ON "_live_posts_v_blocks_gallery" USING btree ("_path");
  CREATE INDEX "_live_posts_v_blocks_video_player_order_idx" ON "_live_posts_v_blocks_video_player" USING btree ("_order");
  CREATE INDEX "_live_posts_v_blocks_video_player_parent_id_idx" ON "_live_posts_v_blocks_video_player" USING btree ("_parent_id");
  CREATE INDEX "_live_posts_v_blocks_video_player_path_idx" ON "_live_posts_v_blocks_video_player" USING btree ("_path");
  CREATE INDEX "_live_posts_v_blocks_video_player_video_idx" ON "_live_posts_v_blocks_video_player" USING btree ("video_id");
  CREATE INDEX "_live_posts_v_blocks_video_player_poster_idx" ON "_live_posts_v_blocks_video_player" USING btree ("poster_id");
  CREATE INDEX "_live_posts_v_blocks_embed_order_idx" ON "_live_posts_v_blocks_embed" USING btree ("_order");
  CREATE INDEX "_live_posts_v_blocks_embed_parent_id_idx" ON "_live_posts_v_blocks_embed" USING btree ("_parent_id");
  CREATE INDEX "_live_posts_v_blocks_embed_path_idx" ON "_live_posts_v_blocks_embed" USING btree ("_path");
  CREATE INDEX "_live_posts_v_parent_idx" ON "_live_posts_v" USING btree ("parent_id");
  CREATE INDEX "_live_posts_v_version_version_slug_idx" ON "_live_posts_v" USING btree ("version_slug");
  CREATE INDEX "_live_posts_v_version_legacy_version_legacy_legacy_path_idx" ON "_live_posts_v" USING btree ("version_legacy_legacy_path");
  CREATE INDEX "_live_posts_v_version_legacy_version_legacy_grove_id_idx" ON "_live_posts_v" USING btree ("version_legacy_grove_id");
  CREATE INDEX "_live_posts_v_version_version_updated_at_idx" ON "_live_posts_v" USING btree ("version_updated_at");
  CREATE INDEX "_live_posts_v_version_version_created_at_idx" ON "_live_posts_v" USING btree ("version_created_at");
  CREATE INDEX "_live_posts_v_version_version__status_idx" ON "_live_posts_v" USING btree ("version__status");
  CREATE INDEX "_live_posts_v_created_at_idx" ON "_live_posts_v" USING btree ("created_at");
  CREATE INDEX "_live_posts_v_updated_at_idx" ON "_live_posts_v" USING btree ("updated_at");
  CREATE INDEX "_live_posts_v_latest_idx" ON "_live_posts_v" USING btree ("latest");
  CREATE INDEX "_live_posts_v_rels_order_idx" ON "_live_posts_v_rels" USING btree ("order");
  CREATE INDEX "_live_posts_v_rels_parent_idx" ON "_live_posts_v_rels" USING btree ("parent_id");
  CREATE INDEX "_live_posts_v_rels_path_idx" ON "_live_posts_v_rels" USING btree ("path");
  CREATE INDEX "_live_posts_v_rels_live_updates_id_idx" ON "_live_posts_v_rels" USING btree ("live_updates_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_live_posts_fk" FOREIGN KEY ("live_posts_id") REFERENCES "public"."live_posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_live_posts_id_idx" ON "payload_locked_documents_rels" USING btree ("live_posts_id");`)
}
