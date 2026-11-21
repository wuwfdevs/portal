import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The home page switches from the coded page to a page of blocks (PAGE-BLOCKS.md → Home, owner, 2026-11-21), and what the Home page global held that no block carries finds its home.
 *
 *  - **The banner** moves to its own global, `site-banner` (publishers edit it; it is the site's, not one page's). The eight `banner_*` columns of `homepage` are copied across,
 *    then dropped. `down` copies them back.
 *  - **The page record**: the home page built from blocks (the page at `/home-blocks`, in the home set) becomes THE home page: its address name is `home`, which the site serves at
 *    `/` and which has no path of its own, its title is "Home page", it is indexed, and its slug is no longer generated from the title. It is renamed in place (the page and its
 *    versions), so every edit the owner made while comparing is kept. A database with no `home-blocks` page, or one that already has a `home` page, is left alone: production
 *    gets its home page at launch (`ROADMAP.md`, "Launch: initializing production"). `down` puts the old address back.
 *
 * The rest of the Home page global (lead, top stories, fellowship, news sections, videos, podcasts, panels) is already in that page's sections and stays in the retired global's
 * columns, unread, until a later cleanup drops them.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_site_banner_scope" AS ENUM('home', 'all');
  CREATE TYPE "public"."enum_site_banner_style" AS ENUM('emergency', 'notice');
  CREATE TABLE "site_banner" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"active" boolean DEFAULT false,
  	"scope" "enum_site_banner_scope" DEFAULT 'home',
  	"style" "enum_site_banner_style" DEFAULT 'emergency',
  	"label" varchar,
  	"headline" varchar,
  	"body" varchar,
  	"link_label" varchar,
  	"link_href" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  INSERT INTO "site_banner" ("active", "scope", "style", "label", "headline", "body", "link_label", "link_href", "updated_at", "created_at")
    SELECT "banner_active", "banner_scope"::text::"enum_site_banner_scope", "banner_style"::text::"enum_site_banner_style", "banner_label", "banner_headline", "banner_body", "banner_link_label", "banner_link_href", now(), now()
    FROM "homepage" ORDER BY "id" LIMIT 1;

  ALTER TABLE "homepage" DROP COLUMN "banner_active";
  ALTER TABLE "homepage" DROP COLUMN "banner_scope";
  ALTER TABLE "homepage" DROP COLUMN "banner_style";
  ALTER TABLE "homepage" DROP COLUMN "banner_label";
  ALTER TABLE "homepage" DROP COLUMN "banner_headline";
  ALTER TABLE "homepage" DROP COLUMN "banner_body";
  ALTER TABLE "homepage" DROP COLUMN "banner_link_label";
  ALTER TABLE "homepage" DROP COLUMN "banner_link_href";
  DROP TYPE "public"."enum_homepage_banner_scope";
  DROP TYPE "public"."enum_homepage_banner_style";

  UPDATE "pages" SET "slug" = 'home', "path" = NULL, "title" = 'Home page', "generate_slug" = false, "noindex" = false
    WHERE "slug" = 'home-blocks' AND NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'home');
  UPDATE "_pages_v" SET "version_slug" = 'home', "version_path" = NULL, "version_title" = 'Home page', "version_generate_slug" = false, "version_noindex" = false
    WHERE "version_slug" = 'home-blocks' AND NOT EXISTS (SELECT 1 FROM "_pages_v" WHERE "version_slug" = 'home');`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   UPDATE "pages" SET "slug" = 'home-blocks', "path" = '/home-blocks', "title" = 'Home page (blocks)', "noindex" = true
    WHERE "slug" = 'home' AND "page_set" = 'home' AND NOT EXISTS (SELECT 1 FROM "pages" WHERE "slug" = 'home-blocks');
  UPDATE "_pages_v" SET "version_slug" = 'home-blocks', "version_path" = '/home-blocks', "version_title" = 'Home page (blocks)', "version_noindex" = true
    WHERE "version_slug" = 'home' AND "version_page_set" = 'home' AND NOT EXISTS (SELECT 1 FROM "_pages_v" WHERE "version_slug" = 'home-blocks');
   CREATE TYPE "public"."enum_homepage_banner_scope" AS ENUM('home', 'all');
  CREATE TYPE "public"."enum_homepage_banner_style" AS ENUM('emergency', 'notice');
  ALTER TABLE "homepage" ADD COLUMN "banner_active" boolean DEFAULT false;
  ALTER TABLE "homepage" ADD COLUMN "banner_scope" "enum_homepage_banner_scope" DEFAULT 'home';
  ALTER TABLE "homepage" ADD COLUMN "banner_style" "enum_homepage_banner_style" DEFAULT 'emergency';
  ALTER TABLE "homepage" ADD COLUMN "banner_label" varchar;
  ALTER TABLE "homepage" ADD COLUMN "banner_headline" varchar;
  ALTER TABLE "homepage" ADD COLUMN "banner_body" varchar;
  ALTER TABLE "homepage" ADD COLUMN "banner_link_label" varchar;
  ALTER TABLE "homepage" ADD COLUMN "banner_link_href" varchar;
  UPDATE "homepage" SET "banner_active" = b."active", "banner_scope" = b."scope"::text::"enum_homepage_banner_scope", "banner_style" = b."style"::text::"enum_homepage_banner_style",
    "banner_label" = b."label", "banner_headline" = b."headline", "banner_body" = b."body", "banner_link_label" = b."link_label", "banner_link_href" = b."link_href"
    FROM (SELECT * FROM "site_banner" ORDER BY "id" LIMIT 1) AS b;
  DROP TABLE "site_banner" CASCADE;
  DROP TYPE "public"."enum_site_banner_scope";
  DROP TYPE "public"."enum_site_banner_style";`)
}
