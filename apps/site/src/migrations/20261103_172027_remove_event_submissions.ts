import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // Public submissions now arrive as draft events with a review status, in the one events collection. This drops the old queue.
  // Refuse if anything is still waiting in it (pending or needing information): review those first (approve or reject), so no
  // submission is lost. Approved and rejected ones are history: the event an approval made already lives in `events`, and the
  // submitter's contact details go with the table (they are not kept longer than needed).
  await db.execute(sql`
   DO $$
  BEGIN
    IF to_regclass('public.event_submissions') IS NOT NULL
       AND EXISTS (SELECT 1 FROM "event_submissions" WHERE "status" IN ('pending', 'needs-info')) THEN
      RAISE EXCEPTION 'event submissions are still waiting for review: approve or reject them in the admin first, then run this migration again';
    END IF;
  END $$;`)
  await db.execute(sql`
   ALTER TABLE "event_submissions_schedule_slots" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "event_submissions_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "event_submissions_schedule_slots" CASCADE;
  DROP TABLE IF EXISTS "event_submissions" CASCADE;
  DROP TABLE IF EXISTS "event_submissions_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_event_submissions_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_event_submissions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "event_submissions_id";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_schedule_slots_day";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_status";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_schedule_kind";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_schedule_nth";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_schedule_weekday";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_organization_designation";
  DROP TYPE IF EXISTS "public"."enum_event_submissions_submitter_role";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_event_submissions_schedule_slots_day" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum_event_submissions_status" AS ENUM('pending', 'needs-info', 'approved', 'rejected');
  CREATE TYPE "public"."enum_event_submissions_schedule_kind" AS ENUM('once', 'daily', 'weekly', 'monthly', 'listed');
  CREATE TYPE "public"."enum_event_submissions_schedule_nth" AS ENUM('1', '2', '3', '4', 'last');
  CREATE TYPE "public"."enum_event_submissions_schedule_weekday" AS ENUM('0', '1', '2', '3', '4', '5', '6');
  CREATE TYPE "public"."enum_event_submissions_organization_designation" AS ENUM('n-a', 'not-for-profit', 'for-profit');
  CREATE TYPE "public"."enum_event_submissions_submitter_role" AS ENUM('listener', 'venue', 'artist', 'promoter');
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
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "event_submissions_id" integer;
  ALTER TABLE "event_submissions_schedule_slots" ADD CONSTRAINT "event_submissions_schedule_slots_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_reviewed_by_id_users_id_fk" FOREIGN KEY ("reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions" ADD CONSTRAINT "event_submissions_image_id_event_submission_images_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."event_submission_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "event_submissions_rels" ADD CONSTRAINT "event_submissions_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "event_submissions_rels" ADD CONSTRAINT "event_submissions_rels_event_categories_fk" FOREIGN KEY ("event_categories_id") REFERENCES "public"."event_categories"("id") ON DELETE cascade ON UPDATE no action;
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
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_event_submissions_fk" FOREIGN KEY ("event_submissions_id") REFERENCES "public"."event_submissions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_event_submissions_id_idx" ON "payload_locked_documents_rels" USING btree ("event_submissions_id");`)
}
