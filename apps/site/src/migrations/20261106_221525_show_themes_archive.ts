import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_field_note_kind" AS ENUM('essay', 'primary-source', 'analysis', 'interview', 'deep-dive');
  CREATE TYPE "public"."enum__posts_v_version_field_note_kind" AS ENUM('essay', 'primary-source', 'analysis', 'interview', 'deep-dive');
  CREATE TYPE "public"."enum_archive_items_kind" AS ENUM('document', 'image', 'map', 'audio', 'transcript');
  CREATE TYPE "public"."enum_archive_items_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__archive_items_v_version_kind" AS ENUM('document', 'image', 'map', 'audio', 'transcript');
  CREATE TYPE "public"."enum__archive_items_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_productions_theme" AS ENUM('barefoot-mary');
  CREATE TABLE "archive_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"production_id" integer,
  	"kind" "enum_archive_items_kind" DEFAULT 'document',
  	"members_only" boolean DEFAULT false,
  	"source" varchar,
  	"description" varchar,
  	"episode_id" integer,
  	"sort_date" timestamp(3) with time zone,
  	"prefix" varchar DEFAULT 'archive',
  	"_objectkey" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_archive_items_status" DEFAULT 'draft',
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
  
  CREATE TABLE "_archive_items_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_production_id" integer,
  	"version_kind" "enum__archive_items_v_version_kind" DEFAULT 'document',
  	"version_members_only" boolean DEFAULT false,
  	"version_source" varchar,
  	"version_description" varchar,
  	"version_episode_id" integer,
  	"version_sort_date" timestamp(3) with time zone,
  	"version_prefix" varchar DEFAULT 'archive',
  	"version__objectkey" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__archive_items_v_version_status" DEFAULT 'draft',
  	"version_url" varchar,
  	"version_thumbnail_u_r_l" varchar,
  	"version_filename" varchar,
  	"version_mime_type" varchar,
  	"version_filesize" numeric,
  	"version_width" numeric,
  	"version_height" numeric,
  	"version_focal_x" numeric,
  	"version_focal_y" numeric,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "productions_show_support_perks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"level" varchar,
  	"title" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "productions_show_support_questions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar
  );
  
  ALTER TABLE "posts" ADD COLUMN "field_note_kind" "enum_posts_field_note_kind";
  ALTER TABLE "_posts_v" ADD COLUMN "version_field_note_kind" "enum__posts_v_version_field_note_kind";
  ALTER TABLE "productions" ADD COLUMN "theme" "enum_productions_theme";
  ALTER TABLE "productions" ADD COLUMN "show_support_eyebrow" varchar DEFAULT 'Support the work';
  ALTER TABLE "productions" ADD COLUMN "show_support_heading" varchar;
  ALTER TABLE "productions" ADD COLUMN "show_support_intro" varchar;
  ALTER TABLE "productions" ADD COLUMN "show_support_donate_url" varchar;
  ALTER TABLE "productions" ADD COLUMN "show_support_donate_label" varchar DEFAULT 'Give on WUWF''s secure form';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "archive_items_id" integer;
  ALTER TABLE "archive_items" ADD CONSTRAINT "archive_items_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "archive_items" ADD CONSTRAINT "archive_items_episode_id_posts_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_archive_items_v" ADD CONSTRAINT "_archive_items_v_parent_id_archive_items_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."archive_items"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_archive_items_v" ADD CONSTRAINT "_archive_items_v_version_production_id_productions_id_fk" FOREIGN KEY ("version_production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_archive_items_v" ADD CONSTRAINT "_archive_items_v_version_episode_id_posts_id_fk" FOREIGN KEY ("version_episode_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "productions_show_support_perks" ADD CONSTRAINT "productions_show_support_perks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "productions_show_support_questions" ADD CONSTRAINT "productions_show_support_questions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "archive_items_production_idx" ON "archive_items" USING btree ("production_id");
  CREATE INDEX "archive_items_members_only_idx" ON "archive_items" USING btree ("members_only");
  CREATE INDEX "archive_items_episode_idx" ON "archive_items" USING btree ("episode_id");
  CREATE INDEX "archive_items_updated_at_idx" ON "archive_items" USING btree ("updated_at");
  CREATE INDEX "archive_items_created_at_idx" ON "archive_items" USING btree ("created_at");
  CREATE INDEX "archive_items__status_idx" ON "archive_items" USING btree ("_status");
  CREATE UNIQUE INDEX "archive_items_filename_idx" ON "archive_items" USING btree ("filename");
  CREATE INDEX "_archive_items_v_parent_idx" ON "_archive_items_v" USING btree ("parent_id");
  CREATE INDEX "_archive_items_v_version_version_production_idx" ON "_archive_items_v" USING btree ("version_production_id");
  CREATE INDEX "_archive_items_v_version_version_members_only_idx" ON "_archive_items_v" USING btree ("version_members_only");
  CREATE INDEX "_archive_items_v_version_version_episode_idx" ON "_archive_items_v" USING btree ("version_episode_id");
  CREATE INDEX "_archive_items_v_version_version_updated_at_idx" ON "_archive_items_v" USING btree ("version_updated_at");
  CREATE INDEX "_archive_items_v_version_version_created_at_idx" ON "_archive_items_v" USING btree ("version_created_at");
  CREATE INDEX "_archive_items_v_version_version__status_idx" ON "_archive_items_v" USING btree ("version__status");
  CREATE INDEX "_archive_items_v_version_version_filename_idx" ON "_archive_items_v" USING btree ("version_filename");
  CREATE INDEX "_archive_items_v_created_at_idx" ON "_archive_items_v" USING btree ("created_at");
  CREATE INDEX "_archive_items_v_updated_at_idx" ON "_archive_items_v" USING btree ("updated_at");
  CREATE INDEX "_archive_items_v_latest_idx" ON "_archive_items_v" USING btree ("latest");
  CREATE INDEX "productions_show_support_perks_order_idx" ON "productions_show_support_perks" USING btree ("_order");
  CREATE INDEX "productions_show_support_perks_parent_id_idx" ON "productions_show_support_perks" USING btree ("_parent_id");
  CREATE INDEX "productions_show_support_questions_order_idx" ON "productions_show_support_questions" USING btree ("_order");
  CREATE INDEX "productions_show_support_questions_parent_id_idx" ON "productions_show_support_questions" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_archive_items_fk" FOREIGN KEY ("archive_items_id") REFERENCES "public"."archive_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_archive_items_id_idx" ON "payload_locked_documents_rels" USING btree ("archive_items_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "archive_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_archive_items_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "productions_show_support_perks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "productions_show_support_questions" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "archive_items" CASCADE;
  DROP TABLE "_archive_items_v" CASCADE;
  DROP TABLE "productions_show_support_perks" CASCADE;
  DROP TABLE "productions_show_support_questions" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_archive_items_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_archive_items_id_idx";
  ALTER TABLE "posts" DROP COLUMN "field_note_kind";
  ALTER TABLE "_posts_v" DROP COLUMN "version_field_note_kind";
  ALTER TABLE "productions" DROP COLUMN "theme";
  ALTER TABLE "productions" DROP COLUMN "show_support_eyebrow";
  ALTER TABLE "productions" DROP COLUMN "show_support_heading";
  ALTER TABLE "productions" DROP COLUMN "show_support_intro";
  ALTER TABLE "productions" DROP COLUMN "show_support_donate_url";
  ALTER TABLE "productions" DROP COLUMN "show_support_donate_label";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "archive_items_id";
  DROP TYPE "public"."enum_posts_field_note_kind";
  DROP TYPE "public"."enum__posts_v_version_field_note_kind";
  DROP TYPE "public"."enum_archive_items_kind";
  DROP TYPE "public"."enum_archive_items_status";
  DROP TYPE "public"."enum__archive_items_v_version_kind";
  DROP TYPE "public"."enum__archive_items_v_version_status";
  DROP TYPE "public"."enum_productions_theme";`)
}
