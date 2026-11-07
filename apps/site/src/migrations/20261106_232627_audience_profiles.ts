import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "audience_profiles" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"supabase_user_id" varchar NOT NULL,
  	"first_sign_in_at" timestamp(3) with time zone,
  	"last_sign_in_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "audience_profiles_id" integer;
  CREATE UNIQUE INDEX "audience_profiles_supabase_user_id_idx" ON "audience_profiles" USING btree ("supabase_user_id");
  CREATE INDEX "audience_profiles_updated_at_idx" ON "audience_profiles" USING btree ("updated_at");
  CREATE INDEX "audience_profiles_created_at_idx" ON "audience_profiles" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audience_profiles_fk" FOREIGN KEY ("audience_profiles_id") REFERENCES "public"."audience_profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_audience_profiles_id_idx" ON "payload_locked_documents_rels" USING btree ("audience_profiles_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "audience_profiles" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "audience_profiles" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_audience_profiles_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_audience_profiles_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "audience_profiles_id";`)
}
