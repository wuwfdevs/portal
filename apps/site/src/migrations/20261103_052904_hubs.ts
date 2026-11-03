import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_period" AS ENUM('paleoindian-archaic', 'woodland-mississippian', 'first-spanish', 'british-west-florida', 'second-spanish', 'territory-statehood', 'civil-war');
  CREATE TYPE "public"."enum__posts_v_version_period" AS ENUM('paleoindian-archaic', 'woodland-mississippian', 'first-spanish', 'british-west-florida', 'second-spanish', 'territory-statehood', 'civil-war');
  CREATE TYPE "public"."enum_sites_era" AS ENUM('native', 'spanish', 'british', 'american');
  CREATE TABLE "sites" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"short" varchar,
  	"place" varchar NOT NULL,
  	"era" "enum_sites_era" NOT NULL,
  	"description" varchar,
  	"map_x" numeric DEFAULT 50,
  	"map_y" numeric DEFAULT 50,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "unearthing_hub_then_now_pairs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"then_id" integer NOT NULL,
  	"now_id" integer NOT NULL
  );
  
  CREATE TABLE "unearthing_hub" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"production_id" integer,
  	"dateline" varchar,
  	"about" varchar,
  	"featured_id" integer,
  	"then_now_heading" varchar,
  	"then_now_blurb" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "voyager_hub_staff" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"person_id" integer NOT NULL,
  	"role" varchar
  );
  
  CREATE TABLE "voyager_hub" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"identity_id" integer,
  	"tagline" varchar DEFAULT 'The student newspaper of the University of West Florida',
  	"featured_id" integer,
  	"podcast_id" integer,
  	"join_heading" varchar DEFAULT 'Write for The Voyager',
  	"join_text" varchar,
  	"join_href" varchar,
  	"footnote" varchar DEFAULT 'The Voyager is written and edited by UWF students, with faculty advising from the Department of Communication. It is published on the WUWF platform; student editors make its editorial decisions.',
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "voyager_hub_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"sections_id" integer
  );
  
  ALTER TABLE "posts" ADD COLUMN "site_id" integer;
  ALTER TABLE "posts" ADD COLUMN "period" "enum_posts_period";
  ALTER TABLE "_posts_v" ADD COLUMN "version_site_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_period" "enum__posts_v_version_period";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sites_id" integer;
  ALTER TABLE "unearthing_hub_then_now_pairs" ADD CONSTRAINT "unearthing_hub_then_now_pairs_then_id_posts_id_fk" FOREIGN KEY ("then_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "unearthing_hub_then_now_pairs" ADD CONSTRAINT "unearthing_hub_then_now_pairs_now_id_posts_id_fk" FOREIGN KEY ("now_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "unearthing_hub_then_now_pairs" ADD CONSTRAINT "unearthing_hub_then_now_pairs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."unearthing_hub"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "unearthing_hub" ADD CONSTRAINT "unearthing_hub_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "unearthing_hub" ADD CONSTRAINT "unearthing_hub_featured_id_posts_id_fk" FOREIGN KEY ("featured_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "voyager_hub_staff" ADD CONSTRAINT "voyager_hub_staff_person_id_contributors_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."contributors"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "voyager_hub_staff" ADD CONSTRAINT "voyager_hub_staff_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."voyager_hub"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "voyager_hub" ADD CONSTRAINT "voyager_hub_identity_id_publishing_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."publishing_identities"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "voyager_hub" ADD CONSTRAINT "voyager_hub_featured_id_posts_id_fk" FOREIGN KEY ("featured_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "voyager_hub" ADD CONSTRAINT "voyager_hub_podcast_id_productions_id_fk" FOREIGN KEY ("podcast_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "voyager_hub_rels" ADD CONSTRAINT "voyager_hub_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."voyager_hub"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "voyager_hub_rels" ADD CONSTRAINT "voyager_hub_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "sites_slug_idx" ON "sites" USING btree ("slug");
  CREATE INDEX "sites_updated_at_idx" ON "sites" USING btree ("updated_at");
  CREATE INDEX "sites_created_at_idx" ON "sites" USING btree ("created_at");
  CREATE INDEX "unearthing_hub_then_now_pairs_order_idx" ON "unearthing_hub_then_now_pairs" USING btree ("_order");
  CREATE INDEX "unearthing_hub_then_now_pairs_parent_id_idx" ON "unearthing_hub_then_now_pairs" USING btree ("_parent_id");
  CREATE INDEX "unearthing_hub_then_now_pairs_then_idx" ON "unearthing_hub_then_now_pairs" USING btree ("then_id");
  CREATE INDEX "unearthing_hub_then_now_pairs_now_idx" ON "unearthing_hub_then_now_pairs" USING btree ("now_id");
  CREATE INDEX "unearthing_hub_production_idx" ON "unearthing_hub" USING btree ("production_id");
  CREATE INDEX "unearthing_hub_featured_idx" ON "unearthing_hub" USING btree ("featured_id");
  CREATE INDEX "voyager_hub_staff_order_idx" ON "voyager_hub_staff" USING btree ("_order");
  CREATE INDEX "voyager_hub_staff_parent_id_idx" ON "voyager_hub_staff" USING btree ("_parent_id");
  CREATE INDEX "voyager_hub_staff_person_idx" ON "voyager_hub_staff" USING btree ("person_id");
  CREATE INDEX "voyager_hub_identity_idx" ON "voyager_hub" USING btree ("identity_id");
  CREATE INDEX "voyager_hub_featured_idx" ON "voyager_hub" USING btree ("featured_id");
  CREATE INDEX "voyager_hub_podcast_idx" ON "voyager_hub" USING btree ("podcast_id");
  CREATE INDEX "voyager_hub_rels_order_idx" ON "voyager_hub_rels" USING btree ("order");
  CREATE INDEX "voyager_hub_rels_parent_idx" ON "voyager_hub_rels" USING btree ("parent_id");
  CREATE INDEX "voyager_hub_rels_path_idx" ON "voyager_hub_rels" USING btree ("path");
  CREATE INDEX "voyager_hub_rels_sections_id_idx" ON "voyager_hub_rels" USING btree ("sections_id");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_site_id_sites_id_fk" FOREIGN KEY ("version_site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sites_fk" FOREIGN KEY ("sites_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_site_idx" ON "posts" USING btree ("site_id");
  CREATE INDEX "_posts_v_version_version_site_idx" ON "_posts_v" USING btree ("version_site_id");
  CREATE INDEX "payload_locked_documents_rels_sites_id_idx" ON "payload_locked_documents_rels" USING btree ("sites_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sites" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "unearthing_hub_then_now_pairs" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "unearthing_hub" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "voyager_hub_staff" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "voyager_hub" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "voyager_hub_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "sites" CASCADE;
  DROP TABLE IF EXISTS "unearthing_hub_then_now_pairs" CASCADE;
  DROP TABLE IF EXISTS "unearthing_hub" CASCADE;
  DROP TABLE IF EXISTS "voyager_hub_staff" CASCADE;
  DROP TABLE IF EXISTS "voyager_hub" CASCADE;
  DROP TABLE IF EXISTS "voyager_hub_rels" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_site_id_sites_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT IF EXISTS "_posts_v_version_site_id_sites_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sites_fk";
  
  DROP INDEX IF EXISTS "posts_site_idx";
  DROP INDEX IF EXISTS "_posts_v_version_version_site_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sites_id_idx";
  ALTER TABLE "posts" DROP COLUMN IF EXISTS "site_id";
  ALTER TABLE "posts" DROP COLUMN IF EXISTS "period";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_site_id";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_period";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sites_id";
  DROP TYPE IF EXISTS "public"."enum_posts_period";
  DROP TYPE IF EXISTS "public"."enum__posts_v_version_period";
  DROP TYPE IF EXISTS "public"."enum_sites_era";`)
}
