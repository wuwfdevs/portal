import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_memberships_source" AS ENUM('manual', 'sync');
  CREATE TABLE "memberships" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"email" varchar NOT NULL,
  	"ends_on" timestamp(3) with time zone NOT NULL,
  	"source" "enum_memberships_source" DEFAULT 'manual' NOT NULL,
  	"note" varchar,
  	"send_claim_email" boolean DEFAULT false,
  	"account_id" integer,
  	"claim_sent_at" timestamp(3) with time zone,
  	"claim_expires_at" timestamp(3) with time zone,
  	"claim_claimed_at" timestamp(3) with time zone,
  	"claim_token_hash" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "memberships_id" integer;
  ALTER TABLE "support_page" ADD COLUMN "members_listening_level" varchar;
  ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_audience_profiles_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."audience_profiles"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "memberships_email_idx" ON "memberships" USING btree ("email");
  CREATE INDEX "memberships_ends_on_idx" ON "memberships" USING btree ("ends_on");
  CREATE INDEX "memberships_account_idx" ON "memberships" USING btree ("account_id");
  CREATE INDEX "memberships_claim_claim_token_hash_idx" ON "memberships" USING btree ("claim_token_hash");
  CREATE INDEX "memberships_updated_at_idx" ON "memberships" USING btree ("updated_at");
  CREATE INDEX "memberships_created_at_idx" ON "memberships" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_memberships_fk" FOREIGN KEY ("memberships_id") REFERENCES "public"."memberships"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_memberships_id_idx" ON "payload_locked_documents_rels" USING btree ("memberships_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "memberships" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "memberships" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_memberships_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_memberships_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "memberships_id";
  ALTER TABLE "support_page" DROP COLUMN "members_listening_level";
  DROP TYPE "public"."enum_memberships_source";`)
}
