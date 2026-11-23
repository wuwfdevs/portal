import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The pages columns behind a show's home page and the hub themes (hubs redesign, 2026-11-23): `pages.show_id` (the production a page speaks for), `pages.is_show_home` ("Use as the show's
 * home page"), `pages.nav_hidden` ("Leave out of the page strip"), their `_pages_v` twins, and the three hub themes as values of `pages.theme`. Written to sort EARLY, right after
 * `home_page_flag_columns` and before `blocks_to_json`, on purpose, for the reason that migration gives: later migrations write pages through the Local API, and Payload reads and writes a
 * document through the config as it is when the migration runs, so a database built from the migrations alone (production at launch, a new station, `pnpm verify:migrations`) fails on a
 * column the config has and the table lacks. Everything is `IF NOT EXISTS`, so a database that already has it (Payload's push in development) is left alone. The ordinary-named
 * `20261123_010555_show_home_page` carries the schema snapshot and nothing else.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_pages_theme" ADD VALUE IF NOT EXISTS 'radiolive';
  ALTER TYPE "public"."enum_pages_theme" ADD VALUE IF NOT EXISTS 'voyager';
  ALTER TYPE "public"."enum_pages_theme" ADD VALUE IF NOT EXISTS 'unearthing';
  ALTER TYPE "public"."enum__pages_v_version_theme" ADD VALUE IF NOT EXISTS 'radiolive';
  ALTER TYPE "public"."enum__pages_v_version_theme" ADD VALUE IF NOT EXISTS 'voyager';
  ALTER TYPE "public"."enum__pages_v_version_theme" ADD VALUE IF NOT EXISTS 'unearthing';
  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "show_id" integer;
  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "is_show_home" boolean DEFAULT false;
  ALTER TABLE "pages" ADD COLUMN IF NOT EXISTS "nav_hidden" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "version_show_id" integer;
  ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "version_is_show_home" boolean DEFAULT false;
  ALTER TABLE "_pages_v" ADD COLUMN IF NOT EXISTS "version_nav_hidden" boolean DEFAULT false;
  DO $$ BEGIN
    ALTER TABLE "pages" ADD CONSTRAINT "pages_show_id_productions_id_fk" FOREIGN KEY ("show_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    ALTER TABLE "_pages_v" ADD CONSTRAINT "_pages_v_version_show_id_productions_id_fk" FOREIGN KEY ("version_show_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE INDEX IF NOT EXISTS "pages_show_idx" ON "pages" USING btree ("show_id");
  CREATE INDEX IF NOT EXISTS "pages_is_show_home_idx" ON "pages" USING btree ("is_show_home");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_version_show_idx" ON "_pages_v" USING btree ("version_show_id");
  CREATE INDEX IF NOT EXISTS "_pages_v_version_version_is_show_home_idx" ON "_pages_v" USING btree ("version_is_show_home");`)
}

/** The theme values stay: Postgres cannot drop a value from an enum, and an unused value is harmless. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "pages_show_idx";
  DROP INDEX IF EXISTS "pages_is_show_home_idx";
  DROP INDEX IF EXISTS "_pages_v_version_version_show_idx";
  DROP INDEX IF EXISTS "_pages_v_version_version_is_show_home_idx";
  ALTER TABLE "pages" DROP CONSTRAINT IF EXISTS "pages_show_id_productions_id_fk";
  ALTER TABLE "_pages_v" DROP CONSTRAINT IF EXISTS "_pages_v_version_show_id_productions_id_fk";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "show_id";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "is_show_home";
  ALTER TABLE "pages" DROP COLUMN IF EXISTS "nav_hidden";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_show_id";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_is_show_home";
  ALTER TABLE "_pages_v" DROP COLUMN IF EXISTS "version_nav_hidden";`)
}
