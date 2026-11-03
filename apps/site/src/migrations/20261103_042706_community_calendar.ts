import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_schedule_slots_day" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum_events_schedule_kind" AS ENUM('once', 'daily', 'weekly', 'monthly', 'listed');
  CREATE TYPE "public"."enum_events_schedule_nth" AS ENUM('1', '2', '3', '4', 'last');
  CREATE TYPE "public"."enum_events_schedule_weekday" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum_events_organization_designation" AS ENUM('n-a', 'not-for-profit', 'for-profit');
  CREATE TYPE "public"."enum_events_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__events_v_version_schedule_slots_day" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum__events_v_version_schedule_kind" AS ENUM('once', 'daily', 'weekly', 'monthly', 'listed');
  CREATE TYPE "public"."enum__events_v_version_schedule_nth" AS ENUM('1', '2', '3', '4', 'last');
  CREATE TYPE "public"."enum__events_v_version_schedule_weekday" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum__events_v_version_organization_designation" AS ENUM('n-a', 'not-for-profit', 'for-profit');
  CREATE TYPE "public"."enum__events_v_version_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum_event_submissions_schedule_slots_day" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum_event_submissions_status" AS ENUM('pending', 'needs-info', 'approved', 'rejected');
  CREATE TYPE "public"."enum_event_submissions_schedule_kind" AS ENUM('once', 'daily', 'weekly', 'monthly', 'listed');
  CREATE TYPE "public"."enum_event_submissions_schedule_nth" AS ENUM('1', '2', '3', '4', 'last');
  CREATE TYPE "public"."enum_event_submissions_schedule_weekday" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum_event_submissions_organization_designation" AS ENUM('n-a', 'not-for-profit', 'for-profit');
  CREATE TYPE "public"."enum_event_submissions_submitter_role" AS ENUM('listener', 'venue', 'artist', 'promoter');
  CREATE TABLE "events_schedule_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" "enum_events_schedule_slots_day",
  	"start" varchar,
  	"end" varchar
  );
  
  CREATE TABLE "events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"teaser" varchar,
  	"description" jsonb,
  	"schedule_kind" "enum_events_schedule_kind" DEFAULT 'once',
  	"schedule_date" varchar,
  	"schedule_start_date" varchar,
  	"schedule_end_date" varchar,
  	"schedule_start" varchar,
  	"schedule_end" varchar,
  	"schedule_every_weeks" numeric,
  	"schedule_every_months" numeric,
  	"schedule_nth" "enum_events_schedule_nth",
  	"schedule_weekday" "enum_events_schedule_weekday",
  	"schedule_display_text" varchar,
  	"schedule_start_estimated" boolean DEFAULT false,
  	"venue_name" varchar,
  	"venue_street" varchar,
  	"venue_city" varchar,
  	"venue_state" varchar,
  	"venue_zip" varchar,
  	"venue_email" varchar,
  	"venue_phone" varchar,
  	"venue_website" varchar,
  	"organization_name" varchar,
  	"organization_email" varchar,
  	"organization_phone" varchar,
  	"organization_website" varchar,
  	"organization_designation" "enum_events_organization_designation" DEFAULT 'n-a',
  	"artist_name" varchar,
  	"artist_email" varchar,
  	"artist_website" varchar,
  	"price" varchar,
  	"free" boolean DEFAULT false,
  	"price_notes" varchar,
  	"ticket_url" varchar,
  	"image_id" integer,
  	"path" varchar,
  	"first_date" varchar,
  	"last_date" varchar,
  	"submission_id" varchar,
  	"legacy_legacy_path" varchar,
  	"legacy_grove_id" varchar,
  	"legacy_modified_at" timestamp(3) with time zone,
  	"legacy_needs_attention" boolean DEFAULT false,
  	"legacy_notes" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_events_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "events_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"event_categories_id" integer
  );
  
  CREATE TABLE "_events_v_version_schedule_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"day" "enum__events_v_version_schedule_slots_day",
  	"start" varchar,
  	"end" varchar,
  	"_uuid" varchar
  );
  
  CREATE TABLE "_events_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_teaser" varchar,
  	"version_description" jsonb,
  	"version_schedule_kind" "enum__events_v_version_schedule_kind" DEFAULT 'once',
  	"version_schedule_date" varchar,
  	"version_schedule_start_date" varchar,
  	"version_schedule_end_date" varchar,
  	"version_schedule_start" varchar,
  	"version_schedule_end" varchar,
  	"version_schedule_every_weeks" numeric,
  	"version_schedule_every_months" numeric,
  	"version_schedule_nth" "enum__events_v_version_schedule_nth",
  	"version_schedule_weekday" "enum__events_v_version_schedule_weekday",
  	"version_schedule_display_text" varchar,
  	"version_schedule_start_estimated" boolean DEFAULT false,
  	"version_venue_name" varchar,
  	"version_venue_street" varchar,
  	"version_venue_city" varchar,
  	"version_venue_state" varchar,
  	"version_venue_zip" varchar,
  	"version_venue_email" varchar,
  	"version_venue_phone" varchar,
  	"version_venue_website" varchar,
  	"version_organization_name" varchar,
  	"version_organization_email" varchar,
  	"version_organization_phone" varchar,
  	"version_organization_website" varchar,
  	"version_organization_designation" "enum__events_v_version_organization_designation" DEFAULT 'n-a',
  	"version_artist_name" varchar,
  	"version_artist_email" varchar,
  	"version_artist_website" varchar,
  	"version_price" varchar,
  	"version_free" boolean DEFAULT false,
  	"version_price_notes" varchar,
  	"version_ticket_url" varchar,
  	"version_image_id" integer,
  	"version_path" varchar,
  	"version_first_date" varchar,
  	"version_last_date" varchar,
  	"version_submission_id" varchar,
  	"version_legacy_legacy_path" varchar,
  	"version_legacy_grove_id" varchar,
  	"version_legacy_modified_at" timestamp(3) with time zone,
  	"version_legacy_needs_attention" boolean DEFAULT false,
  	"version_legacy_notes" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__events_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_events_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"event_categories_id" integer
  );
  
  CREATE TABLE "event_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"legacy_grove_id" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "event_submissions_schedule_slots" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"day" "enum_event_submissions_schedule_slots_day",
  	"start" varchar,
  	"end" varchar
  );
  
  CREATE TABLE "event_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"status" "enum_event_submissions_status" DEFAULT 'pending' NOT NULL,
  	"concerns" varchar,
  	"review_note" varchar,
  	"reviewed_by_id" integer,
  	"reviewed_at" timestamp(3) with time zone,
  	"event_id" integer,
  	"client_key" varchar,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"schedule_kind" "enum_event_submissions_schedule_kind" DEFAULT 'once' NOT NULL,
  	"schedule_date" varchar,
  	"schedule_start_date" varchar,
  	"schedule_end_date" varchar,
  	"schedule_start" varchar,
  	"schedule_end" varchar,
  	"schedule_every_weeks" numeric,
  	"schedule_every_months" numeric,
  	"schedule_nth" "enum_event_submissions_schedule_nth",
  	"schedule_weekday" "enum_event_submissions_schedule_weekday",
  	"schedule_display_text" varchar,
  	"schedule_start_estimated" boolean DEFAULT false,
  	"venue_name" varchar NOT NULL,
  	"venue_street" varchar,
  	"venue_city" varchar,
  	"venue_state" varchar,
  	"venue_zip" varchar,
  	"venue_email" varchar,
  	"venue_phone" varchar,
  	"venue_website" varchar,
  	"organization_name" varchar,
  	"organization_email" varchar,
  	"organization_phone" varchar,
  	"organization_website" varchar,
  	"organization_designation" "enum_event_submissions_organization_designation" DEFAULT 'n-a',
  	"artist_name" varchar,
  	"artist_email" varchar,
  	"artist_website" varchar,
  	"price" varchar,
  	"free" boolean DEFAULT false,
  	"price_notes" varchar,
  	"ticket_url" varchar,
  	"image_id" integer,
  	"submitter_name" varchar,
  	"submitter_email" varchar NOT NULL,
  	"submitter_role" "enum_event_submissions_submitter_role",
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "event_submissions_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"event_categories_id" integer
  );
  
  CREATE TABLE "event_submission_images" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prefix" varchar DEFAULT 'event-submission-images',
  	"_objectkey" varchar,
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
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "events_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_categories_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_submissions_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_submission_images_id" integer;
  ALTER TABLE "events_schedule_slots" ADD CONSTRAINT "events_schedule_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "events_rels" ADD CONSTRAINT "events_rels_event_categories_fk" FOREIGN KEY ("event_categories_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_version_schedule_slots" ADD CONSTRAINT "_events_v_version_schedule_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_parent_id_events_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_events_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_events_v_rels" ADD CONSTRAINT "_events_v_rels_event_categories_fk" FOREIGN KEY ("event_categories_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions_schedule_slots" ADD CONSTRAINT "event_submissions_schedule_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_image_id_event_submission_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."event_submission_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions_rels" ADD CONSTRAINT "event_submissions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions_rels" ADD CONSTRAINT "event_submissions_rels_event_categories_fk" FOREIGN KEY ("event_categories_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_schedule_slots_order_idx" ON "events_schedule_slots" USING btree ("_order");
  CREATE INDEX "events_schedule_slots_parent_id_idx" ON "events_schedule_slots" USING btree ("_parent_id");
  CREATE INDEX "events_title_idx" ON "events" USING btree ("title");
  CREATE INDEX "events_image_idx" ON "events" USING btree ("image_id");
  CREATE UNIQUE INDEX "events_path_idx" ON "events" USING btree ("path");
  CREATE INDEX "events_first_date_idx" ON "events" USING btree ("first_date");
  CREATE INDEX "events_last_date_idx" ON "events" USING btree ("last_date");
  CREATE INDEX "events_submission_id_idx" ON "events" USING btree ("submission_id");
  CREATE UNIQUE INDEX "events_legacy_legacy_legacy_path_idx" ON "events" USING btree ("legacy_legacy_path");
  CREATE UNIQUE INDEX "events_legacy_legacy_grove_id_idx" ON "events" USING btree ("legacy_grove_id");
  CREATE INDEX "events_updated_at_idx" ON "events" USING btree ("updated_at");
  CREATE INDEX "events_created_at_idx" ON "events" USING btree ("created_at");
  CREATE INDEX "events__status_idx" ON "events" USING btree ("_status");
  CREATE INDEX "events_rels_order_idx" ON "events_rels" USING btree ("order");
  CREATE INDEX "events_rels_parent_idx" ON "events_rels" USING btree ("parent_id");
  CREATE INDEX "events_rels_path_idx" ON "events_rels" USING btree ("path");
  CREATE INDEX "events_rels_event_categories_id_idx" ON "events_rels" USING btree ("event_categories_id");
  CREATE INDEX "_events_v_version_schedule_slots_order_idx" ON "_events_v_version_schedule_slots" USING btree ("_order");
  CREATE INDEX "_events_v_version_schedule_slots_parent_id_idx" ON "_events_v_version_schedule_slots" USING btree ("_parent_id");
  CREATE INDEX "_events_v_parent_idx" ON "_events_v" USING btree ("parent_id");
  CREATE INDEX "_events_v_version_version_title_idx" ON "_events_v" USING btree ("version_title");
  CREATE INDEX "_events_v_version_version_image_idx" ON "_events_v" USING btree ("version_image_id");
  CREATE INDEX "_events_v_version_version_path_idx" ON "_events_v" USING btree ("version_path");
  CREATE INDEX "_events_v_version_version_first_date_idx" ON "_events_v" USING btree ("version_first_date");
  CREATE INDEX "_events_v_version_version_last_date_idx" ON "_events_v" USING btree ("version_last_date");
  CREATE INDEX "_events_v_version_version_submission_id_idx" ON "_events_v" USING btree ("version_submission_id");
  CREATE INDEX "_events_v_version_legacy_version_legacy_legacy_path_idx" ON "_events_v" USING btree ("version_legacy_legacy_path");
  CREATE INDEX "_events_v_version_legacy_version_legacy_grove_id_idx" ON "_events_v" USING btree ("version_legacy_grove_id");
  CREATE INDEX "_events_v_version_version_updated_at_idx" ON "_events_v" USING btree ("version_updated_at");
  CREATE INDEX "_events_v_version_version_created_at_idx" ON "_events_v" USING btree ("version_created_at");
  CREATE INDEX "_events_v_version_version__status_idx" ON "_events_v" USING btree ("version__status");
  CREATE INDEX "_events_v_created_at_idx" ON "_events_v" USING btree ("created_at");
  CREATE INDEX "_events_v_updated_at_idx" ON "_events_v" USING btree ("updated_at");
  CREATE INDEX "_events_v_latest_idx" ON "_events_v" USING btree ("latest");
  CREATE INDEX "_events_v_rels_order_idx" ON "_events_v_rels" USING btree ("order");
  CREATE INDEX "_events_v_rels_parent_idx" ON "_events_v_rels" USING btree ("parent_id");
  CREATE INDEX "_events_v_rels_path_idx" ON "_events_v_rels" USING btree ("path");
  CREATE INDEX "_events_v_rels_event_categories_id_idx" ON "_events_v_rels" USING btree ("event_categories_id");
  CREATE UNIQUE INDEX "event_categories_slug_idx" ON "event_categories" USING btree ("slug");
  CREATE UNIQUE INDEX "event_categories_legacy_legacy_grove_id_idx" ON "event_categories" USING btree ("legacy_grove_id");
  CREATE INDEX "event_categories_updated_at_idx" ON "event_categories" USING btree ("updated_at");
  CREATE INDEX "event_categories_created_at_idx" ON "event_categories" USING btree ("created_at");
  CREATE INDEX "event_submissions_schedule_slots_order_idx" ON "event_submissions_schedule_slots" USING btree ("_order");
  CREATE INDEX "event_submissions_schedule_slots_parent_id_idx" ON "event_submissions_schedule_slots" USING btree ("_parent_id");
  CREATE INDEX "event_submissions_status_idx" ON "event_submissions" USING btree ("status");
  CREATE INDEX "event_submissions_reviewed_by_idx" ON "event_submissions" USING btree ("reviewed_by_id");
  CREATE INDEX "event_submissions_event_idx" ON "event_submissions" USING btree ("event_id");
  CREATE INDEX "event_submissions_client_key_idx" ON "event_submissions" USING btree ("client_key");
  CREATE INDEX "event_submissions_image_idx" ON "event_submissions" USING btree ("image_id");
  CREATE INDEX "event_submissions_updated_at_idx" ON "event_submissions" USING btree ("updated_at");
  CREATE INDEX "event_submissions_created_at_idx" ON "event_submissions" USING btree ("created_at");
  CREATE INDEX "event_submissions_rels_order_idx" ON "event_submissions_rels" USING btree ("order");
  CREATE INDEX "event_submissions_rels_parent_idx" ON "event_submissions_rels" USING btree ("parent_id");
  CREATE INDEX "event_submissions_rels_path_idx" ON "event_submissions_rels" USING btree ("path");
  CREATE INDEX "event_submissions_rels_event_categories_id_idx" ON "event_submissions_rels" USING btree ("event_categories_id");
  CREATE INDEX "event_submission_images_updated_at_idx" ON "event_submission_images" USING btree ("updated_at");
  CREATE INDEX "event_submission_images_created_at_idx" ON "event_submission_images" USING btree ("created_at");
  CREATE UNIQUE INDEX "event_submission_images_filename_idx" ON "event_submission_images" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_events_fk" FOREIGN KEY ("events_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_categories_fk" FOREIGN KEY ("event_categories_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_submissions_fk" FOREIGN KEY ("event_submissions_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_submission_images_fk" FOREIGN KEY ("event_submission_images_id") REFERENCES "public"."event_submission_images"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_events_id_idx" ON "payload_locked_documents_rels" USING btree ("events_id");
  CREATE INDEX "payload_locked_documents_rels_event_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("event_categories_id");
  CREATE INDEX "payload_locked_documents_rels_event_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("event_submissions_id");
  CREATE INDEX "payload_locked_documents_rels_event_submission_images_id_idx" ON "payload_locked_documents_rels" USING btree ("event_submission_images_id");`)

  // Data: the calendar's twelve categories (Grove's, with its ids so the migrated events and its filter addresses map across).
  // The public submission form lists these, so they must exist as soon as the schema does. Safe to run twice.
  const categories: [string, string, string][] = [
    ['Art & Museum Exhibits', 'art-and-museum-exhibits', '00000175-2811-dc5e-a1ff-be1702b50000'],
    ['Benefits/Fundraisers', 'benefits-fundraisers', '00000175-2811-dc5e-a1ff-be1709180000'],
    ['Classes/Workshops', 'classes-workshops', '00000175-2811-dc5e-a1ff-be170b9b0000'],
    ['Community Events', 'community-events', '00000175-2811-dc5e-a1ff-be1705520001'],
    ['Fairs & Festivals', 'fairs-and-festivals', '00000175-2811-dc5e-a1ff-be1714fc0000'],
    ['Kids & Family', 'kids-and-family', '00000175-2811-dc5e-a1ff-be1702cd0000'],
    ['Misc.', 'misc', '00000175-2811-dc5e-a1ff-be171f480000'],
    ['Music: Classical', 'music-classical', '00000179-9f5f-d29c-ab79-ffff115d0000'],
    ['Music: Other', 'music-other', '00000175-2811-dc5e-a1ff-be170d450000'],
    ['Outdoors', 'outdoors', '00000175-2811-dc5e-a1ff-be1723760000'],
    ['Theater', 'theater', '00000175-2811-dc5e-a1ff-be170c710000'],
    ['University of West Florida', 'university-of-west-florida', '00000175-2811-dc5e-a1ff-be170b810000'],
  ]
  for (const [title, slug, groveId] of categories) {
    await db.execute(sql`
      INSERT INTO "event_categories" ("title", "slug", "legacy_grove_id")
      SELECT ${title}, ${slug}, ${groveId}
      WHERE NOT EXISTS (SELECT 1 FROM "event_categories" WHERE "slug" = ${slug} OR "legacy_grove_id" = ${groveId})`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "events_schedule_slots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "events_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_version_schedule_slots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_events_v_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_categories" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions_schedule_slots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submission_images" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "events_schedule_slots" CASCADE;
  DROP TABLE "events" CASCADE;
  DROP TABLE "events_rels" CASCADE;
  DROP TABLE "_events_v_version_schedule_slots" CASCADE;
  DROP TABLE "_events_v" CASCADE;
  DROP TABLE "_events_v_rels" CASCADE;
  DROP TABLE "event_categories" CASCADE;
  DROP TABLE "event_submissions_schedule_slots" CASCADE;
  DROP TABLE "event_submissions" CASCADE;
  DROP TABLE "event_submissions_rels" CASCADE;
  DROP TABLE "event_submission_images" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_events_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_event_categories_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_event_submissions_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_event_submission_images_fk";
  
  DROP INDEX "payload_locked_documents_rels_events_id_idx";
  DROP INDEX "payload_locked_documents_rels_event_categories_id_idx";
  DROP INDEX "payload_locked_documents_rels_event_submissions_id_idx";
  DROP INDEX "payload_locked_documents_rels_event_submission_images_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "events_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_categories_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_submissions_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "event_submission_images_id";
  DROP TYPE "public"."enum_events_schedule_slots_day";
  DROP TYPE "public"."enum_events_schedule_kind";
  DROP TYPE "public"."enum_events_schedule_nth";
  DROP TYPE "public"."enum_events_schedule_weekday";
  DROP TYPE "public"."enum_events_organization_designation";
  DROP TYPE "public"."enum_events_status";
  DROP TYPE "public"."enum__events_v_version_schedule_slots_day";
  DROP TYPE "public"."enum__events_v_version_schedule_kind";
  DROP TYPE "public"."enum__events_v_version_schedule_nth";
  DROP TYPE "public"."enum__events_v_version_schedule_weekday";
  DROP TYPE "public"."enum__events_v_version_organization_designation";
  DROP TYPE "public"."enum__events_v_version_status";
  DROP TYPE "public"."enum_event_submissions_schedule_slots_day";
  DROP TYPE "public"."enum_event_submissions_status";
  DROP TYPE "public"."enum_event_submissions_schedule_kind";
  DROP TYPE "public"."enum_event_submissions_schedule_nth";
  DROP TYPE "public"."enum_event_submissions_schedule_weekday";
  DROP TYPE "public"."enum_event_submissions_organization_designation";
  DROP TYPE "public"."enum_event_submissions_submitter_role";`)
}
