import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" ADD COLUMN "prefix" varchar DEFAULT 'media';
  ALTER TABLE "media" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "audio" ADD COLUMN "prefix" varchar DEFAULT 'audio';
  ALTER TABLE "audio" ADD COLUMN "_objectkey" varchar;
  ALTER TABLE "video" ADD COLUMN "prefix" varchar DEFAULT 'video';
  ALTER TABLE "video" ADD COLUMN "_objectkey" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "media" DROP COLUMN "prefix";
  ALTER TABLE "media" DROP COLUMN "_objectkey";
  ALTER TABLE "audio" DROP COLUMN "prefix";
  ALTER TABLE "audio" DROP COLUMN "_objectkey";
  ALTER TABLE "video" DROP COLUMN "prefix";
  ALTER TABLE "video" DROP COLUMN "_objectkey";`)
}
