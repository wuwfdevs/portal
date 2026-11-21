import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Home page's "emergency coverage" notice becomes the site banner: the six columns are renamed (a notice already switched on keeps its words),
 * and it gains where it appears (the home page or every page) and its style (emergency or notice).
 *
 * The label used to default to "Emergency coverage". It now defaults from the style, so a label still holding the old default is cleared (an
 * editor's own words are kept); otherwise a notice would be drawn under the heading "Emergency coverage". `down` puts the old default back.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_homepage_banner_scope" AS ENUM('home', 'all');
  CREATE TYPE "public"."enum_homepage_banner_style" AS ENUM('emergency', 'notice');
  ALTER TABLE "homepage" RENAME COLUMN "emergency_active" TO "banner_active";
  ALTER TABLE "homepage" RENAME COLUMN "emergency_label" TO "banner_label";
  ALTER TABLE "homepage" RENAME COLUMN "emergency_headline" TO "banner_headline";
  ALTER TABLE "homepage" RENAME COLUMN "emergency_body" TO "banner_body";
  ALTER TABLE "homepage" RENAME COLUMN "emergency_link_label" TO "banner_link_label";
  ALTER TABLE "homepage" RENAME COLUMN "emergency_link_href" TO "banner_link_href";
  ALTER TABLE "homepage" ALTER COLUMN "banner_label" DROP DEFAULT;
  UPDATE "homepage" SET "banner_label" = NULL WHERE "banner_label" = 'Emergency coverage';
  ALTER TABLE "homepage" ADD COLUMN "banner_scope" "enum_homepage_banner_scope" DEFAULT 'home';
  ALTER TABLE "homepage" ADD COLUMN "banner_style" "enum_homepage_banner_style" DEFAULT 'emergency';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" DROP COLUMN "banner_scope";
  ALTER TABLE "homepage" DROP COLUMN "banner_style";
  DROP TYPE "public"."enum_homepage_banner_scope";
  DROP TYPE "public"."enum_homepage_banner_style";
  UPDATE "homepage" SET "banner_label" = 'Emergency coverage' WHERE "banner_label" IS NULL;
  ALTER TABLE "homepage" ALTER COLUMN "banner_label" SET DEFAULT 'Emergency coverage';
  ALTER TABLE "homepage" RENAME COLUMN "banner_active" TO "emergency_active";
  ALTER TABLE "homepage" RENAME COLUMN "banner_label" TO "emergency_label";
  ALTER TABLE "homepage" RENAME COLUMN "banner_headline" TO "emergency_headline";
  ALTER TABLE "homepage" RENAME COLUMN "banner_body" TO "emergency_body";
  ALTER TABLE "homepage" RENAME COLUMN "banner_link_label" TO "emergency_link_label";
  ALTER TABLE "homepage" RENAME COLUMN "banner_link_href" TO "emergency_link_href";`)
}
