import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" ADD COLUMN "related_min_similarity" numeric DEFAULT 0.35;
  ALTER TABLE "site_settings" ADD COLUMN "search_min_similarity" numeric DEFAULT 0.2;
  ALTER TABLE "site_settings" ADD COLUMN "related_max_per_series" numeric DEFAULT 2;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "site_settings" DROP COLUMN "related_min_similarity";
  ALTER TABLE "site_settings" DROP COLUMN "search_min_similarity";
  ALTER TABLE "site_settings" DROP COLUMN "related_max_per_series";`)
}
