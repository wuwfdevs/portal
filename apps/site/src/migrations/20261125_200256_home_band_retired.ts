import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Removes the home page banner zone (the homepage rethink, 2026-11-25: it sat directly after a row of sponsor tiles, two sponsor units back to back with no story between,
 * and needed artwork of its own). It never ran for a real sponsor (production's database is empty, and staging held one demonstration placement), so any placement still
 * in it is deleted before the zone is dropped from the list, as `20261120_221651_story_rail_retired` did for the story rail. `down` puts the value back; the placements are
 * not restored.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE text;
  DELETE FROM "placement_items" WHERE "zone" = 'home.band';
  DROP TYPE "public"."enum_placement_items_zone";
  CREATE TYPE "public"."enum_placement_items_zone" AS ENUM('home.top', 'home.rail', 'list.top', 'list.rail', 'story.inline');
  ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE "public"."enum_placement_items_zone" USING "zone"::"public"."enum_placement_items_zone";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_placement_items_zone" ADD VALUE 'home.band' BEFORE 'list.top';`)
}
