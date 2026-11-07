import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "members_only" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_members_only" boolean DEFAULT false;
  ALTER TABLE "audio" ADD COLUMN "members_only" boolean DEFAULT false;
  CREATE INDEX "posts_members_only_idx" ON "posts" USING btree ("members_only");
  CREATE INDEX "_posts_v_version_version_members_only_idx" ON "_posts_v" USING btree ("version_members_only");
  CREATE INDEX "audio_members_only_idx" ON "audio" USING btree ("members_only");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "posts_members_only_idx";
  DROP INDEX "_posts_v_version_version_members_only_idx";
  DROP INDEX "audio_members_only_idx";
  ALTER TABLE "posts" DROP COLUMN "members_only";
  ALTER TABLE "_posts_v" DROP COLUMN "version_members_only";
  ALTER TABLE "audio" DROP COLUMN "members_only";`)
}
