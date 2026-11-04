import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_productions_kind" AS ENUM('original', 'syndicated');
  ALTER TABLE "productions" ADD COLUMN "kind" "enum_productions_kind" DEFAULT 'original' NOT NULL;
  ALTER TABLE "productions" ADD COLUMN "program_url" varchar;
  CREATE INDEX "productions_kind_idx" ON "productions" USING btree ("kind");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "productions_kind_idx";
  ALTER TABLE "productions" DROP COLUMN "kind";
  ALTER TABLE "productions" DROP COLUMN "program_url";
  DROP TYPE "public"."enum_productions_kind";`)
}
