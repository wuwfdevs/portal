import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Removes the story rail zone (owner, 2026-11-20: a story carries its inline bands only). It never ran for a real sponsor (production's database is empty, and staging held two
 * demonstration placements), so any placement still in it is deleted, with its targets, before the zone is dropped from the list. `down` puts the value back; the placements
 * are not restored.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE text;
  DELETE FROM "placement_items" WHERE "zone" = 'story.rail';
  DROP TYPE "public"."enum_placement_items_zone";
  CREATE TYPE "public"."enum_placement_items_zone" AS ENUM('home.top', 'home.rail', 'home.band', 'list.top', 'list.rail', 'story.inline');
  ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE "public"."enum_placement_items_zone" USING "zone"::"public"."enum_placement_items_zone";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_placement_items_zone" ADD VALUE 'story.rail' BEFORE 'story.inline';`)
}
