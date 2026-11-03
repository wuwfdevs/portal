import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_events_review_status" AS ENUM('pending', 'needs-info', 'rejected', 'approved');
  CREATE TYPE "public"."enum_events_submitter_role" AS ENUM('listener', 'venue', 'artist', 'promoter');
  CREATE TYPE "public"."enum__events_v_version_review_status" AS ENUM('pending', 'needs-info', 'rejected', 'approved');
  CREATE TYPE "public"."enum__events_v_version_submitter_role" AS ENUM('listener', 'venue', 'artist', 'promoter');
  CREATE TABLE "submission_rate_limits" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "events" ADD COLUMN "review_status" "enum_events_review_status";
  ALTER TABLE "events" ADD COLUMN "review_concerns" varchar;
  ALTER TABLE "events" ADD COLUMN "review_note" varchar;
  ALTER TABLE "events" ADD COLUMN "review_reviewed_by_id" integer;
  ALTER TABLE "events" ADD COLUMN "review_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "events" ADD COLUMN "submitter_name" varchar;
  ALTER TABLE "events" ADD COLUMN "submitter_email" varchar;
  ALTER TABLE "events" ADD COLUMN "submitter_role" "enum_events_submitter_role";
  ALTER TABLE "events" ADD COLUMN "submitted_image_id" integer;
  ALTER TABLE "_events_v" ADD COLUMN "version_review_status" "enum__events_v_version_review_status";
  ALTER TABLE "_events_v" ADD COLUMN "version_review_concerns" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_review_note" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_review_reviewed_by_id" integer;
  ALTER TABLE "_events_v" ADD COLUMN "version_review_reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "_events_v" ADD COLUMN "version_submitter_name" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_submitter_email" varchar;
  ALTER TABLE "_events_v" ADD COLUMN "version_submitter_role" "enum__events_v_version_submitter_role";
  ALTER TABLE "_events_v" ADD COLUMN "version_submitted_image_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "submission_rate_limits_id" integer;
  CREATE INDEX "submission_rate_limits_key_idx" ON "submission_rate_limits" USING btree ("key");
  CREATE INDEX "submission_rate_limits_updated_at_idx" ON "submission_rate_limits" USING btree ("updated_at");
  CREATE INDEX "submission_rate_limits_created_at_idx" ON "submission_rate_limits" USING btree ("created_at");
  ALTER TABLE "events" ADD CONSTRAINT "events_review_reviewed_by_id_users_id_fk" FOREIGN KEY ("review_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "events" ADD CONSTRAINT "events_submitted_image_id_event_submission_images_id_fk" FOREIGN KEY ("submitted_image_id") REFERENCES "public"."event_submission_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_review_reviewed_by_id_users_id_fk" FOREIGN KEY ("version_review_reviewed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_events_v" ADD CONSTRAINT "_events_v_version_submitted_image_id_event_submission_images_id_fk" FOREIGN KEY ("version_submitted_image_id") REFERENCES "public"."event_submission_images"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_submission_rate_limits_fk" FOREIGN KEY ("submission_rate_limits_id") REFERENCES "public"."submission_rate_limits"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "events_review_review_status_idx" ON "events" USING btree ("review_status");
  CREATE INDEX "events_review_review_reviewed_by_idx" ON "events" USING btree ("review_reviewed_by_id");
  CREATE INDEX "events_submitted_image_idx" ON "events" USING btree ("submitted_image_id");
  CREATE INDEX "_events_v_version_review_version_review_status_idx" ON "_events_v" USING btree ("version_review_status");
  CREATE INDEX "_events_v_version_review_version_review_reviewed_by_idx" ON "_events_v" USING btree ("version_review_reviewed_by_id");
  CREATE INDEX "_events_v_version_version_submitted_image_idx" ON "_events_v" USING btree ("version_submitted_image_id");
  CREATE INDEX "payload_locked_documents_rels_submission_rate_limits_id_idx" ON "payload_locked_documents_rels" USING btree ("submission_rate_limits_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "submission_rate_limits" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "submission_rate_limits" CASCADE;
  ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_review_reviewed_by_id_users_id_fk";
  
  ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_submitted_image_id_event_submission_images_id_fk";
  
  ALTER TABLE "_events_v" DROP CONSTRAINT IF EXISTS "_events_v_version_review_reviewed_by_id_users_id_fk";
  
  ALTER TABLE "_events_v" DROP CONSTRAINT IF EXISTS "_events_v_version_submitted_image_id_event_submission_images_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_submission_rate_limits_fk";
  
  DROP INDEX IF EXISTS "events_review_review_status_idx";
  DROP INDEX IF EXISTS "events_review_review_reviewed_by_idx";
  DROP INDEX IF EXISTS "events_submitted_image_idx";
  DROP INDEX IF EXISTS "_events_v_version_review_version_review_status_idx";
  DROP INDEX IF EXISTS "_events_v_version_review_version_review_reviewed_by_idx";
  DROP INDEX IF EXISTS "_events_v_version_version_submitted_image_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_submission_rate_limits_id_idx";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "review_status";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "review_concerns";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "review_note";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "review_reviewed_by_id";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "review_reviewed_at";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "submitter_name";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "submitter_email";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "submitter_role";
  ALTER TABLE "events" DROP COLUMN IF EXISTS "submitted_image_id";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_review_status";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_review_concerns";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_review_note";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_review_reviewed_by_id";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_review_reviewed_at";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_submitter_name";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_submitter_email";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_submitter_role";
  ALTER TABLE "_events_v" DROP COLUMN IF EXISTS "version_submitted_image_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "submission_rate_limits_id";
  DROP TYPE IF EXISTS "public"."enum_events_review_status";
  DROP TYPE IF EXISTS "public"."enum_events_submitter_role";
  DROP TYPE IF EXISTS "public"."enum__events_v_version_review_status";
  DROP TYPE IF EXISTS "public"."enum__events_v_version_submitter_role";`)
}
