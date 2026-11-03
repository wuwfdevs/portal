import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "productions" ADD COLUMN "path" varchar;
  ALTER TABLE "productions" ADD COLUMN "tagline" varchar;
  ALTER TABLE "productions" ADD COLUMN "schedule" varchar;
  ALTER TABLE "productions" ADD COLUMN "description" jsonb;
  ALTER TABLE "productions" ADD COLUMN "listed" boolean DEFAULT true;
  ALTER TABLE "productions" ADD COLUMN "legacy_legacy_path" varchar;
  ALTER TABLE "productions" ADD COLUMN "legacy_grove_id" varchar;
  ALTER TABLE "productions_rels" ADD COLUMN "contributors_id" integer;
  ALTER TABLE "productions_rels" ADD CONSTRAINT "productions_rels_contributors_fk" FOREIGN KEY ("contributors_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "productions_path_idx" ON "productions" USING btree ("path");
  CREATE UNIQUE INDEX "productions_legacy_legacy_legacy_path_idx" ON "productions" USING btree ("legacy_legacy_path");
  CREATE UNIQUE INDEX "productions_legacy_legacy_grove_id_idx" ON "productions" USING btree ("legacy_grove_id");
  CREATE INDEX "productions_rels_contributors_id_idx" ON "productions_rels" USING btree ("contributors_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "productions_rels" DROP CONSTRAINT "productions_rels_contributors_fk";
  
  DROP INDEX "productions_path_idx";
  DROP INDEX "productions_legacy_legacy_legacy_path_idx";
  DROP INDEX "productions_legacy_legacy_grove_id_idx";
  DROP INDEX "productions_rels_contributors_id_idx";
  ALTER TABLE "productions" DROP COLUMN "path";
  ALTER TABLE "productions" DROP COLUMN "tagline";
  ALTER TABLE "productions" DROP COLUMN "schedule";
  ALTER TABLE "productions" DROP COLUMN "description";
  ALTER TABLE "productions" DROP COLUMN "listed";
  ALTER TABLE "productions" DROP COLUMN "legacy_legacy_path";
  ALTER TABLE "productions" DROP COLUMN "legacy_grove_id";
  ALTER TABLE "productions_rels" DROP COLUMN "contributors_id";`)
}
