import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The column behind The Voyager's footnote (hubs redesign, slice 5): `shared_text.voyager_footnote`, the Shared text global's new field. It sorts after `20261119_233120_shared_text`,
 * which creates the table with raw SQL (so it does not read the config and is not broken by this column), and before the data step `20261123_030100_voyager_page`, which copies the
 * old hub's footnote into it. `IF NOT EXISTS`, so a database Payload's push already changed (development) is left alone.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "shared_text" ADD COLUMN IF NOT EXISTS "voyager_footnote" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "shared_text" DROP COLUMN IF EXISTS "voyager_footnote";`)
}
