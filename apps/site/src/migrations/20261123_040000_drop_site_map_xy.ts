import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Drops the retired schematic position of a site (`sites.map_x`, `sites.map_y`: two percentages on a drawing of the state; hubs redesign, slice 6). The Explore block places a site by its
 * latitude and longitude, a drawing's percentages cannot be turned into a place, and nothing has read these since the coded Unearthing hub went. They were nullable with a default, so no earlier
 * migration depends on them. `IF EXISTS`, so a database Payload's push already changed (development) is left alone.
 *
 * `down` puts the columns back as they were (`numeric DEFAULT 50`); the positions that were stored are gone, which is the point.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sites" DROP COLUMN IF EXISTS "map_x";
  ALTER TABLE "sites" DROP COLUMN IF EXISTS "map_y";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "map_x" numeric DEFAULT 50;
  ALTER TABLE "sites" ADD COLUMN IF NOT EXISTS "map_y" numeric DEFAULT 50;`)
}
