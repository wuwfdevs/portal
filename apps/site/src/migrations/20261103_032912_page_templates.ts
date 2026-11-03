import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_pages_template" AS ENUM('standard', 'blocks');
  CREATE TYPE "public"."enum__pages_v_version_template" AS ENUM('standard', 'blocks');
  ALTER TABLE "pages" ADD COLUMN "template" "enum_pages_template" DEFAULT 'standard';
  ALTER TABLE "pages" ADD COLUMN "summary" varchar;
  ALTER TABLE "pages" ADD COLUMN "body" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_template" "enum__pages_v_version_template" DEFAULT 'standard';
  ALTER TABLE "_pages_v" ADD COLUMN "version_summary" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_body" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" DROP COLUMN "template";
  ALTER TABLE "pages" DROP COLUMN "summary";
  ALTER TABLE "pages" DROP COLUMN "body";
  ALTER TABLE "_pages_v" DROP COLUMN "version_template";
  ALTER TABLE "_pages_v" DROP COLUMN "version_summary";
  ALTER TABLE "_pages_v" DROP COLUMN "version_body";
  DROP TYPE "public"."enum_pages_template";
  DROP TYPE "public"."enum__pages_v_version_template";`)
}
