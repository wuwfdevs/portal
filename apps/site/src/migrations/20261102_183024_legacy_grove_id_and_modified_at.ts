import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ADD COLUMN "legacy_grove_id" varchar;
  ALTER TABLE "pages" ADD COLUMN "legacy_modified_at" timestamp(3) with time zone;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_grove_id" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_modified_at" timestamp(3) with time zone;
  ALTER TABLE "posts" ADD COLUMN "legacy_grove_id" varchar;
  ALTER TABLE "posts" ADD COLUMN "legacy_modified_at" timestamp(3) with time zone;
  ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_grove_id" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_modified_at" timestamp(3) with time zone;
  CREATE UNIQUE INDEX "pages_legacy_legacy_grove_id_idx" ON "pages" USING btree ("legacy_grove_id");
  CREATE INDEX "_pages_v_version_legacy_version_legacy_grove_id_idx" ON "_pages_v" USING btree ("version_legacy_grove_id");
  CREATE UNIQUE INDEX "posts_legacy_legacy_grove_id_idx" ON "posts" USING btree ("legacy_grove_id");
  CREATE INDEX "_posts_v_version_legacy_version_legacy_grove_id_idx" ON "_posts_v" USING btree ("version_legacy_grove_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "pages_legacy_legacy_grove_id_idx";
  DROP INDEX "_pages_v_version_legacy_version_legacy_grove_id_idx";
  DROP INDEX "posts_legacy_legacy_grove_id_idx";
  DROP INDEX "_posts_v_version_legacy_version_legacy_grove_id_idx";
  ALTER TABLE "pages" DROP COLUMN "legacy_grove_id";
  ALTER TABLE "pages" DROP COLUMN "legacy_modified_at";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_grove_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_modified_at";
  ALTER TABLE "posts" DROP COLUMN "legacy_grove_id";
  ALTER TABLE "posts" DROP COLUMN "legacy_modified_at";
  ALTER TABLE "_posts_v" DROP COLUMN "version_legacy_grove_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_legacy_modified_at";`)
}
