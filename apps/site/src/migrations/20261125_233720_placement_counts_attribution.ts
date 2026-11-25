import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "placement_counts" DROP CONSTRAINT "placement_counts_pkey";
  ALTER TABLE "placement_counts" ADD COLUMN "id" bigserial PRIMARY KEY NOT NULL;
  ALTER TABLE "placement_counts" ADD CONSTRAINT "placement_counts_key" UNIQUE NULLS NOT DISTINCT("day","placement_id","zone","kind","sponsor_id","filter_version");`)
}

// Down merges the rows the new key keeps apart (a day split between two sponsors, or a sponsor and a house promotion) into the one row the old key
// allows, crediting the most recently counted sponsor and kind, then restores the old key. The split is lost, which is what going back means.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TEMP TABLE placement_counts_merged ON COMMIT DROP AS
     SELECT day, placement_id, zone, filter_version,
       (array_agg(kind ORDER BY updated_at DESC))[1] AS kind,
       (array_agg(sponsor_id ORDER BY updated_at DESC))[1] AS sponsor_id,
       sum(measurable)::integer AS measurable, sum(viewable)::integer AS viewable, sum(clicked)::integer AS clicked,
       max(updated_at) AS updated_at
     FROM placement_counts GROUP BY day, placement_id, zone, filter_version;
  ALTER TABLE "placement_counts" DROP CONSTRAINT "placement_counts_key";
  ALTER TABLE "placement_counts" DROP COLUMN "id";
  DELETE FROM "placement_counts";
  INSERT INTO "placement_counts" (day, placement_id, zone, kind, sponsor_id, filter_version, measurable, viewable, clicked, updated_at)
    SELECT day, placement_id, zone, kind, sponsor_id, filter_version, measurable, viewable, clicked, updated_at FROM placement_counts_merged;
  ALTER TABLE "placement_counts" ADD CONSTRAINT "placement_counts_pkey" PRIMARY KEY("day","placement_id","zone","filter_version");`)
}
