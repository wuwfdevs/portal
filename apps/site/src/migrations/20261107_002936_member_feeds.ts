import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "member_feeds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"account_id" integer NOT NULL,
  	"production_id" integer NOT NULL,
  	"version" numeric NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "member_feeds_id" integer;
  ALTER TABLE "member_feeds" ADD CONSTRAINT "member_feeds_account_id_audience_profiles_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."audience_profiles"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "member_feeds" ADD CONSTRAINT "member_feeds_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "member_feeds_account_idx" ON "member_feeds" USING btree ("account_id");
  CREATE INDEX "member_feeds_production_idx" ON "member_feeds" USING btree ("production_id");
  CREATE INDEX "member_feeds_updated_at_idx" ON "member_feeds" USING btree ("updated_at");
  CREATE INDEX "member_feeds_created_at_idx" ON "member_feeds" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_member_feeds_fk" FOREIGN KEY ("member_feeds_id") REFERENCES "public"."member_feeds"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_member_feeds_id_idx" ON "payload_locked_documents_rels" USING btree ("member_feeds_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "member_feeds" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "member_feeds" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_member_feeds_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_member_feeds_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "member_feeds_id";`)
}
