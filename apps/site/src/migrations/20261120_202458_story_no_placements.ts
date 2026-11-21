import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" ADD COLUMN "no_placements" boolean DEFAULT false;
  ALTER TABLE "_posts_v" ADD COLUMN "version_no_placements" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts" DROP COLUMN "no_placements";
  ALTER TABLE "_posts_v" DROP COLUMN "version_no_placements";`)
}
