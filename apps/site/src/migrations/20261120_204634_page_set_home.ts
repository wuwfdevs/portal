import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_pages_page_set" ADD VALUE 'home' BEFORE 'sponsor';
  ALTER TYPE "public"."enum__pages_v_version_page_set" ADD VALUE 'home' BEFORE 'sponsor';`)
}

/**
 * Adds the `home` page set (the home page's blocks, PAGE-BLOCKS.md → Home). `down` cannot keep a page in a set that no longer exists, so a page (and a saved version)
 * in it is taken out of any set before the earlier list is put back: its sections stay, and it becomes a plain page.
 */
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pages" ALTER COLUMN "page_set" SET DATA TYPE text;
  UPDATE "pages" SET "page_set" = NULL WHERE "page_set" = 'home';
  DROP TYPE "public"."enum_pages_page_set";
  CREATE TYPE "public"."enum_pages_page_set" AS ENUM('sponsor', 'giving', 'listens', 'voyager', 'unearthing', 'radiolive');
  ALTER TABLE "pages" ALTER COLUMN "page_set" SET DATA TYPE "public"."enum_pages_page_set" USING "page_set"::"public"."enum_pages_page_set";
  ALTER TABLE "_pages_v" ALTER COLUMN "version_page_set" SET DATA TYPE text;
  UPDATE "_pages_v" SET "version_page_set" = NULL WHERE "version_page_set" = 'home';
  DROP TYPE "public"."enum__pages_v_version_page_set";
  CREATE TYPE "public"."enum__pages_v_version_page_set" AS ENUM('sponsor', 'giving', 'listens', 'voyager', 'unearthing', 'radiolive');
  ALTER TABLE "_pages_v" ALTER COLUMN "version_page_set" SET DATA TYPE "public"."enum__pages_v_version_page_set" USING "version_page_set"::"public"."enum__pages_v_version_page_set";`)
}
