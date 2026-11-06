import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_performances_tickets_status" AS ENUM('soon', 'onSale', 'soldOut', 'free');
  CREATE TYPE "public"."enum_performances_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__performances_v_version_tickets_status" AS ENUM('soon', 'onSale', 'soldOut', 'free');
  CREATE TYPE "public"."enum__performances_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "artists" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"photo_id" integer,
  	"bio" varchar,
  	"link" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "performances" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar,
  	"starts_at" timestamp(3) with time zone,
  	"venue" varchar DEFAULT 'Museum of Commerce, 201 Zaragoza St.',
  	"description" varchar,
  	"photo_id" integer,
  	"tickets_status" "enum_performances_tickets_status" DEFAULT 'soon',
  	"tickets_url" varchar,
  	"video_id" integer,
  	"captions_vtt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_performances_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "performances_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"artists_id" integer
  );
  
  CREATE TABLE "_performances_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_generate_slug" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_starts_at" timestamp(3) with time zone,
  	"version_venue" varchar DEFAULT 'Museum of Commerce, 201 Zaragoza St.',
  	"version_description" varchar,
  	"version_photo_id" integer,
  	"version_tickets_status" "enum__performances_v_version_tickets_status" DEFAULT 'soon',
  	"version_tickets_url" varchar,
  	"version_video_id" integer,
  	"version_captions_vtt" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__performances_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_performances_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"artists_id" integer
  );
  
  CREATE TABLE "radiolive_hub" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"production_id" integer,
  	"tagline" varchar DEFAULT 'Songwriters live from downtown Pensacola, on the air on 88.1 FM',
  	"hero_photo_id" integer,
  	"host_kicker" varchar DEFAULT 'On the air since 1988',
  	"host_heading" varchar DEFAULT 'Hosted by Tanya Gallagher, with William Howell & The Coveralls',
  	"host_text" varchar DEFAULT 'A songwriters'' show in front of a live audience in downtown Pensacola, broadcast on WUWF 88.1.',
  	"host_portrait_id" integer,
  	"host_href" varchar,
  	"encores_heading" varchar DEFAULT 'The best past sets, Thursdays 7–8 p.m.',
  	"encores_text" varchar DEFAULT 'Except the first Thursday of the month, when RadioLive is live.',
  	"encores_link_label" varchar DEFAULT 'Open the audio archive',
  	"encores_href" varchar DEFAULT '/podcasts',
  	"support_heading" varchar DEFAULT 'Keep the music live.',
  	"support_text" varchar DEFAULT 'Direct your WUWF membership to RadioLive. It pays the artists, keeps the equipment current and keeps every show free on the air.',
  	"support_button_label" varchar DEFAULT 'Give to RadioLive',
  	"support_href" varchar DEFAULT '/support',
  	"support_note" varchar DEFAULT 'On the donation form, choose "Count my gift as support for RadioLive."',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "artists_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "performances_id" integer;
  ALTER TABLE "artists" ADD CONSTRAINT "artists_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "performances" ADD CONSTRAINT "performances_photo_id_media_id_fk" FOREIGN KEY ("photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "performances" ADD CONSTRAINT "performances_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "performances_rels" ADD CONSTRAINT "performances_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "performances_rels" ADD CONSTRAINT "performances_rels_artists_fk" FOREIGN KEY ("artists_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_performances_v" ADD CONSTRAINT "_performances_v_parent_id_performances_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."performances"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_performances_v" ADD CONSTRAINT "_performances_v_version_photo_id_media_id_fk" FOREIGN KEY ("version_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_performances_v" ADD CONSTRAINT "_performances_v_version_video_id_video_id_fk" FOREIGN KEY ("version_video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_performances_v_rels" ADD CONSTRAINT "_performances_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_performances_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_performances_v_rels" ADD CONSTRAINT "_performances_v_rels_artists_fk" FOREIGN KEY ("artists_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "radiolive_hub" ADD CONSTRAINT "radiolive_hub_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "radiolive_hub" ADD CONSTRAINT "radiolive_hub_hero_photo_id_media_id_fk" FOREIGN KEY ("hero_photo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "radiolive_hub" ADD CONSTRAINT "radiolive_hub_host_portrait_id_media_id_fk" FOREIGN KEY ("host_portrait_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "artists_name_idx" ON "artists" USING btree ("name");
  CREATE UNIQUE INDEX "artists_slug_idx" ON "artists" USING btree ("slug");
  CREATE INDEX "artists_photo_idx" ON "artists" USING btree ("photo_id");
  CREATE INDEX "artists_updated_at_idx" ON "artists" USING btree ("updated_at");
  CREATE INDEX "artists_created_at_idx" ON "artists" USING btree ("created_at");
  CREATE UNIQUE INDEX "performances_slug_idx" ON "performances" USING btree ("slug");
  CREATE INDEX "performances_starts_at_idx" ON "performances" USING btree ("starts_at");
  CREATE INDEX "performances_photo_idx" ON "performances" USING btree ("photo_id");
  CREATE INDEX "performances_video_idx" ON "performances" USING btree ("video_id");
  CREATE INDEX "performances_updated_at_idx" ON "performances" USING btree ("updated_at");
  CREATE INDEX "performances_created_at_idx" ON "performances" USING btree ("created_at");
  CREATE INDEX "performances__status_idx" ON "performances" USING btree ("_status");
  CREATE INDEX "performances_rels_order_idx" ON "performances_rels" USING btree ("order");
  CREATE INDEX "performances_rels_parent_idx" ON "performances_rels" USING btree ("parent_id");
  CREATE INDEX "performances_rels_path_idx" ON "performances_rels" USING btree ("path");
  CREATE INDEX "performances_rels_artists_id_idx" ON "performances_rels" USING btree ("artists_id");
  CREATE INDEX "_performances_v_parent_idx" ON "_performances_v" USING btree ("parent_id");
  CREATE INDEX "_performances_v_version_version_slug_idx" ON "_performances_v" USING btree ("version_slug");
  CREATE INDEX "_performances_v_version_version_starts_at_idx" ON "_performances_v" USING btree ("version_starts_at");
  CREATE INDEX "_performances_v_version_version_photo_idx" ON "_performances_v" USING btree ("version_photo_id");
  CREATE INDEX "_performances_v_version_version_video_idx" ON "_performances_v" USING btree ("version_video_id");
  CREATE INDEX "_performances_v_version_version_updated_at_idx" ON "_performances_v" USING btree ("version_updated_at");
  CREATE INDEX "_performances_v_version_version_created_at_idx" ON "_performances_v" USING btree ("version_created_at");
  CREATE INDEX "_performances_v_version_version__status_idx" ON "_performances_v" USING btree ("version__status");
  CREATE INDEX "_performances_v_created_at_idx" ON "_performances_v" USING btree ("created_at");
  CREATE INDEX "_performances_v_updated_at_idx" ON "_performances_v" USING btree ("updated_at");
  CREATE INDEX "_performances_v_latest_idx" ON "_performances_v" USING btree ("latest");
  CREATE INDEX "_performances_v_rels_order_idx" ON "_performances_v_rels" USING btree ("order");
  CREATE INDEX "_performances_v_rels_parent_idx" ON "_performances_v_rels" USING btree ("parent_id");
  CREATE INDEX "_performances_v_rels_path_idx" ON "_performances_v_rels" USING btree ("path");
  CREATE INDEX "_performances_v_rels_artists_id_idx" ON "_performances_v_rels" USING btree ("artists_id");
  CREATE INDEX "radiolive_hub_production_idx" ON "radiolive_hub" USING btree ("production_id");
  CREATE INDEX "radiolive_hub_hero_photo_idx" ON "radiolive_hub" USING btree ("hero_photo_id");
  CREATE INDEX "radiolive_hub_host_host_portrait_idx" ON "radiolive_hub" USING btree ("host_portrait_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_artists_fk" FOREIGN KEY ("artists_id") REFERENCES "public"."artists"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_performances_fk" FOREIGN KEY ("performances_id") REFERENCES "public"."performances"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_artists_id_idx" ON "payload_locked_documents_rels" USING btree ("artists_id");
  CREATE INDEX "payload_locked_documents_rels_performances_id_idx" ON "payload_locked_documents_rels" USING btree ("performances_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "artists" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "performances" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "performances_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_performances_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_performances_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "radiolive_hub" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "artists" CASCADE;
  DROP TABLE "performances" CASCADE;
  DROP TABLE "performances_rels" CASCADE;
  DROP TABLE "_performances_v" CASCADE;
  DROP TABLE "_performances_v_rels" CASCADE;
  DROP TABLE "radiolive_hub" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_artists_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_performances_fk";
  
  DROP INDEX "payload_locked_documents_rels_artists_id_idx";
  DROP INDEX "payload_locked_documents_rels_performances_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "artists_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "performances_id";
  DROP TYPE "public"."enum_performances_tickets_status";
  DROP TYPE "public"."enum_performances_status";
  DROP TYPE "public"."enum__performances_v_version_tickets_status";
  DROP TYPE "public"."enum__performances_v_version_status";`)
}
