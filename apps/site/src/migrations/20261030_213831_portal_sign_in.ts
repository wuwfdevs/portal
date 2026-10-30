import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "portal_sign_ins" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"jti" varchar NOT NULL,
  	"portal_user_id" varchar NOT NULL,
  	"expires_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "sessions_valid_after" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "portal_sign_ins_id" integer;
  CREATE UNIQUE INDEX "portal_sign_ins_jti_idx" ON "portal_sign_ins" USING btree ("jti");
  CREATE INDEX "portal_sign_ins_expires_at_idx" ON "portal_sign_ins" USING btree ("expires_at");
  CREATE INDEX "portal_sign_ins_updated_at_idx" ON "portal_sign_ins" USING btree ("updated_at");
  CREATE INDEX "portal_sign_ins_created_at_idx" ON "portal_sign_ins" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_portal_sign_ins_fk" FOREIGN KEY ("portal_sign_ins_id") REFERENCES "public"."portal_sign_ins"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_portal_sign_ins_id_idx" ON "payload_locked_documents_rels" USING btree ("portal_sign_ins_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "portal_sign_ins" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "portal_sign_ins" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_portal_sign_ins_fk";
  
  DROP INDEX "payload_locked_documents_rels_portal_sign_ins_id_idx";
  ALTER TABLE "users" DROP COLUMN "sessions_valid_after";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "portal_sign_ins_id";`)
}
