import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_placement_items_zone" ADD VALUE 'story.rail';
  ALTER TYPE "public"."enum_placement_items_zone" ADD VALUE 'story.inline';`)
}

/**
 * Adds the two story zones (`story.rail`, `story.inline`) to the placement zones. `down` cannot keep a placement in a zone that no longer exists, so it deletes
 * those first before it puts the earlier list back.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE text;
  DELETE FROM "placement_items" WHERE "zone" IN ('story.rail', 'story.inline');
  DROP TYPE "public"."enum_placement_items_zone";
  CREATE TYPE "public"."enum_placement_items_zone" AS ENUM('home.top', 'home.rail', 'home.band', 'list.top', 'list.rail');
  ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE "public"."enum_placement_items_zone" USING "zone"::"public"."enum_placement_items_zone";`)
}
