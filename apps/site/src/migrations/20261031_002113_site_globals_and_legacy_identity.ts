import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_source" AS ENUM('wuwf', 'npr', 'wire');
  CREATE TYPE "public"."enum__posts_v_version_source" AS ENUM('wuwf', 'npr', 'wire');
  CREATE TYPE "public"."enum_header_sections_link_type" AS ENUM('reference', 'custom');
  CREATE TYPE "public"."enum_footer_columns_links_link_type" AS ENUM('reference', 'custom');
  CREATE TABLE "header_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "enum_header_sections_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar NOT NULL
  );
  
  CREATE TABLE "footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"link_type" "enum_footer_columns_links_link_type" DEFAULT 'reference',
  	"link_new_tab" boolean,
  	"link_url" varchar,
  	"link_label" varchar NOT NULL
  );
  
  CREATE TABLE "footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL
  );
  
  CREATE TABLE "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"independence_policy_id" integer,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "pages" ADD COLUMN "legacy_legacy_path" varchar;
  ALTER TABLE "pages" ADD COLUMN "legacy_npr_id" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_legacy_path" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_legacy_npr_id" varchar;
  ALTER TABLE "posts" ADD COLUMN "source" "enum_posts_source" DEFAULT 'wuwf';
  ALTER TABLE "posts" ADD COLUMN "legacy_legacy_path" varchar;
  ALTER TABLE "posts" ADD COLUMN "legacy_npr_id" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_source" "enum__posts_v_version_source" DEFAULT 'wuwf';
  ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_legacy_path" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_legacy_npr_id" varchar;
  ALTER TABLE "header_sections" ADD CONSTRAINT "header_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."header"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_columns_links" ADD CONSTRAINT "footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "footer_columns" ADD CONSTRAINT "footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."footer"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_independence_policy_id_pages_id_fk" FOREIGN KEY ("independence_policy_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "header_sections_order_idx" ON "header_sections" USING btree ("_order");
  CREATE INDEX "header_sections_parent_id_idx" ON "header_sections" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_links_order_idx" ON "footer_columns_links" USING btree ("_order");
  CREATE INDEX "footer_columns_links_parent_id_idx" ON "footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "footer_columns_order_idx" ON "footer_columns" USING btree ("_order");
  CREATE INDEX "footer_columns_parent_id_idx" ON "footer_columns" USING btree ("_parent_id");
  CREATE INDEX "site_settings_independence_policy_idx" ON "site_settings" USING btree ("independence_policy_id");
  CREATE UNIQUE INDEX "pages_legacy_legacy_legacy_path_idx" ON "pages" USING btree ("legacy_legacy_path");
  CREATE UNIQUE INDEX "pages_legacy_legacy_npr_id_idx" ON "pages" USING btree ("legacy_npr_id");
  CREATE INDEX "_pages_v_version_legacy_version_legacy_legacy_path_idx" ON "_pages_v" USING btree ("version_legacy_legacy_path");
  CREATE INDEX "_pages_v_version_legacy_version_legacy_npr_id_idx" ON "_pages_v" USING btree ("version_legacy_npr_id");
  CREATE UNIQUE INDEX "posts_legacy_legacy_legacy_path_idx" ON "posts" USING btree ("legacy_legacy_path");
  CREATE UNIQUE INDEX "posts_legacy_legacy_npr_id_idx" ON "posts" USING btree ("legacy_npr_id");
  CREATE INDEX "_posts_v_version_legacy_version_legacy_legacy_path_idx" ON "_posts_v" USING btree ("version_legacy_legacy_path");
  CREATE INDEX "_posts_v_version_legacy_version_legacy_npr_id_idx" ON "_posts_v" USING btree ("version_legacy_npr_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "header_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "footer_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "header_sections" CASCADE;
  DROP TABLE "footer_columns_links" CASCADE;
  DROP TABLE "footer_columns" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP INDEX "pages_legacy_legacy_legacy_path_idx";
  DROP INDEX "pages_legacy_legacy_npr_id_idx";
  DROP INDEX "_pages_v_version_legacy_version_legacy_legacy_path_idx";
  DROP INDEX "_pages_v_version_legacy_version_legacy_npr_id_idx";
  DROP INDEX "posts_legacy_legacy_legacy_path_idx";
  DROP INDEX "posts_legacy_legacy_npr_id_idx";
  DROP INDEX "_posts_v_version_legacy_version_legacy_legacy_path_idx";
  DROP INDEX "_posts_v_version_legacy_version_legacy_npr_id_idx";
  ALTER TABLE "pages" DROP COLUMN "legacy_legacy_path";
  ALTER TABLE "pages" DROP COLUMN "legacy_npr_id";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_legacy_path";
  ALTER TABLE "_pages_v" DROP COLUMN "version_legacy_npr_id";
  ALTER TABLE "posts" DROP COLUMN "source";
  ALTER TABLE "posts" DROP COLUMN "legacy_legacy_path";
  ALTER TABLE "posts" DROP COLUMN "legacy_npr_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_source";
  ALTER TABLE "_posts_v" DROP COLUMN "version_legacy_legacy_path";
  ALTER TABLE "_posts_v" DROP COLUMN "version_legacy_npr_id";
  DROP TYPE "public"."enum_posts_source";
  DROP TYPE "public"."enum__posts_v_version_source";
  DROP TYPE "public"."enum_header_sections_link_type";
  DROP TYPE "public"."enum_footer_columns_links_link_type";`)
}
