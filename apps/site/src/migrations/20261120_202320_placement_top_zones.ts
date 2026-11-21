import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_placement_items_zone" ADD VALUE 'home.top' BEFORE 'home.rail';
  ALTER TYPE "public"."enum_placement_items_zone" ADD VALUE 'list.top' BEFORE 'list.rail';`)
}

/**
 * Adds the two top-unit zones (`home.top`, `list.top`) to the placement zones. `down` cannot keep a placement in a zone that no longer exists, so it deletes those
 * (their picture links and targets go with them) before it puts the old list back.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE text;
  DELETE FROM "placement_items" WHERE "zone" IN ('home.top', 'list.top');
  DROP TYPE "public"."enum_placement_items_zone";
  CREATE TYPE "public"."enum_placement_items_zone" AS ENUM('home.rail', 'home.band', 'list.rail');
  ALTER TABLE "placement_items" ALTER COLUMN "zone" SET DATA TYPE "public"."enum_placement_items_zone" USING "zone"::"public"."enum_placement_items_zone";`)
}
