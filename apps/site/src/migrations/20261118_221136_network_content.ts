import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_network_sources_find_by" AS ENUM('owner', 'collection');
  CREATE TYPE "public"."enum_network_sources_mode" AS ENUM('queue', 'auto');
  CREATE TYPE "public"."enum_network_items_status" AS ENUM('new', 'held', 'dismissed', 'published', 'gone');
  CREATE TYPE "public"."enum_network_items_audio_skipped" AS ENUM('unavailable', 'expired', 'restricted', 'premium', 'tracked', 'sponsored', 'no-file');
  CREATE TABLE "network_sources" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"find_by" "enum_network_sources_find_by" DEFAULT 'owner' NOT NULL,
  	"service_id" varchar,
  	"collection_id" numeric,
  	"mode" "enum_network_sources_mode" DEFAULT 'queue' NOT NULL,
  	"section_id" integer,
  	"active" boolean DEFAULT true,
  	"notes" varchar,
  	"poll_last_polled_at" timestamp(3) with time zone,
  	"poll_cursor" timestamp(3) with time zone,
  	"poll_found_new" numeric,
  	"poll_skipped_restricted" numeric,
  	"poll_error" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "network_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"status" "enum_network_items_status" DEFAULT 'new' NOT NULL,
  	"source_id" integer NOT NULL,
  	"cds_id" varchar NOT NULL,
  	"teaser" varchar,
  	"published_at" timestamp(3) with time zone,
  	"modified_at" timestamp(3) with time zone,
  	"canonical_url" varchar,
  	"owner_hrefs" jsonb,
  	"branding_hrefs" jsonb,
  	"image_href" varchar,
  	"image_href_template" varchar,
  	"image_width" numeric,
  	"image_height" numeric,
  	"image_alt_text" varchar,
  	"image_caption" varchar,
  	"image_credit" varchar,
  	"image_dropped_as_restricted" boolean DEFAULT false,
  	"audio_href" varchar,
  	"audio_mime_type" varchar,
  	"audio_duration_seconds" numeric,
  	"audio_skipped" "enum_network_items_audio_skipped",
  	"post_id" integer,
  	"first_seen_at" timestamp(3) with time zone,
  	"last_seen_at" timestamp(3) with time zone,
  	"gone_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "posts" ADD COLUMN "original_url" varchar;
  ALTER TABLE "posts" ADD COLUMN "original_credit" varchar;
  ALTER TABLE "posts" ADD COLUMN "original_cds_id" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_original_url" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_original_credit" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_original_cds_id" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "network_sources_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "network_items_id" integer;
  ALTER TABLE "network_sources" ADD CONSTRAINT "network_sources_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "network_items" ADD CONSTRAINT "network_items_source_id_network_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."network_sources"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "network_items" ADD CONSTRAINT "network_items_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "network_sources_section_idx" ON "network_sources" USING btree ("section_id");
  CREATE INDEX "network_sources_updated_at_idx" ON "network_sources" USING btree ("updated_at");
  CREATE INDEX "network_sources_created_at_idx" ON "network_sources" USING btree ("created_at");
  CREATE INDEX "network_items_status_idx" ON "network_items" USING btree ("status");
  CREATE INDEX "network_items_source_idx" ON "network_items" USING btree ("source_id");
  CREATE UNIQUE INDEX "network_items_cds_id_idx" ON "network_items" USING btree ("cds_id");
  CREATE INDEX "network_items_published_at_idx" ON "network_items" USING btree ("published_at");
  CREATE INDEX "network_items_post_idx" ON "network_items" USING btree ("post_id");
  CREATE INDEX "network_items_last_seen_at_idx" ON "network_items" USING btree ("last_seen_at");
  CREATE INDEX "network_items_updated_at_idx" ON "network_items" USING btree ("updated_at");
  CREATE INDEX "network_items_created_at_idx" ON "network_items" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_network_sources_fk" FOREIGN KEY ("network_sources_id") REFERENCES "public"."network_sources"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_network_items_fk" FOREIGN KEY ("network_items_id") REFERENCES "public"."network_items"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "posts_original_original_cds_id_idx" ON "posts" USING btree ("original_cds_id");
  CREATE INDEX "_posts_v_version_original_version_original_cds_id_idx" ON "_posts_v" USING btree ("version_original_cds_id");
  CREATE INDEX "payload_locked_documents_rels_network_sources_id_idx" ON "payload_locked_documents_rels" USING btree ("network_sources_id");
  CREATE INDEX "payload_locked_documents_rels_network_items_id_idx" ON "payload_locked_documents_rels" USING btree ("network_items_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "network_sources" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "network_items" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "network_sources" CASCADE;
  DROP TABLE "network_items" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_network_sources_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_network_items_fk";
  
  DROP INDEX "posts_original_original_cds_id_idx";
  DROP INDEX "_posts_v_version_original_version_original_cds_id_idx";
  DROP INDEX "payload_locked_documents_rels_network_sources_id_idx";
  DROP INDEX "payload_locked_documents_rels_network_items_id_idx";
  ALTER TABLE "posts" DROP COLUMN "original_url";
  ALTER TABLE "posts" DROP COLUMN "original_credit";
  ALTER TABLE "posts" DROP COLUMN "original_cds_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_original_url";
  ALTER TABLE "_posts_v" DROP COLUMN "version_original_credit";
  ALTER TABLE "_posts_v" DROP COLUMN "version_original_cds_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "network_sources_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "network_items_id";
  DROP TYPE "public"."enum_network_sources_find_by";
  DROP TYPE "public"."enum_network_sources_mode";
  DROP TYPE "public"."enum_network_items_status";
  DROP TYPE "public"."enum_network_items_audio_skipped";`)
}
