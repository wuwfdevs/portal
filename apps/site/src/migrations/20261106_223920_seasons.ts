import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_episode_type" AS ENUM('full', 'trailer', 'bonus');
  CREATE TYPE "public"."enum__posts_v_version_episode_type" AS ENUM('full', 'trailer', 'bonus');
  CREATE TYPE "public"."enum_seasons_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__seasons_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "seasons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"production_id" integer,
  	"number" numeric,
  	"title" varchar,
  	"summary" varchar,
  	"image_id" integer,
  	"label" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_seasons_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "_seasons_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_production_id" integer,
  	"version_number" numeric,
  	"version_title" varchar,
  	"version_summary" varchar,
  	"version_image_id" integer,
  	"version_label" varchar,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__seasons_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  ALTER TABLE "posts" ADD COLUMN "season_id" integer;
  ALTER TABLE "posts" ADD COLUMN "episode_number" numeric;
  ALTER TABLE "posts" ADD COLUMN "episode_type" "enum_posts_episode_type" DEFAULT 'full';
  ALTER TABLE "_posts_v" ADD COLUMN "version_season_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_episode_number" numeric;
  ALTER TABLE "_posts_v" ADD COLUMN "version_episode_type" "enum__posts_v_version_episode_type" DEFAULT 'full';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "seasons_id" integer;
  ALTER TABLE "seasons" ADD CONSTRAINT "seasons_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "seasons" ADD CONSTRAINT "seasons_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_seasons_v" ADD CONSTRAINT "_seasons_v_parent_id_seasons_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_seasons_v" ADD CONSTRAINT "_seasons_v_version_production_id_productions_id_fk" FOREIGN KEY ("version_production_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_seasons_v" ADD CONSTRAINT "_seasons_v_version_image_id_media_id_fk" FOREIGN KEY ("version_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "seasons_production_idx" ON "seasons" USING btree ("production_id");
  CREATE INDEX "seasons_image_idx" ON "seasons" USING btree ("image_id");
  CREATE INDEX "seasons_label_idx" ON "seasons" USING btree ("label");
  CREATE INDEX "seasons_updated_at_idx" ON "seasons" USING btree ("updated_at");
  CREATE INDEX "seasons_created_at_idx" ON "seasons" USING btree ("created_at");
  CREATE INDEX "seasons__status_idx" ON "seasons" USING btree ("_status");
  CREATE INDEX "_seasons_v_parent_idx" ON "_seasons_v" USING btree ("parent_id");
  CREATE INDEX "_seasons_v_version_version_production_idx" ON "_seasons_v" USING btree ("version_production_id");
  CREATE INDEX "_seasons_v_version_version_image_idx" ON "_seasons_v" USING btree ("version_image_id");
  CREATE INDEX "_seasons_v_version_version_label_idx" ON "_seasons_v" USING btree ("version_label");
  CREATE INDEX "_seasons_v_version_version_updated_at_idx" ON "_seasons_v" USING btree ("version_updated_at");
  CREATE INDEX "_seasons_v_version_version_created_at_idx" ON "_seasons_v" USING btree ("version_created_at");
  CREATE INDEX "_seasons_v_version_version__status_idx" ON "_seasons_v" USING btree ("version__status");
  CREATE INDEX "_seasons_v_created_at_idx" ON "_seasons_v" USING btree ("created_at");
  CREATE INDEX "_seasons_v_updated_at_idx" ON "_seasons_v" USING btree ("updated_at");
  CREATE INDEX "_seasons_v_latest_idx" ON "_seasons_v" USING btree ("latest");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_season_id_seasons_id_fk" FOREIGN KEY ("version_season_id") REFERENCES "public"."seasons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_seasons_fk" FOREIGN KEY ("seasons_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "posts_season_idx" ON "posts" USING btree ("season_id");
  CREATE INDEX "_posts_v_version_version_season_idx" ON "_posts_v" USING btree ("version_season_id");
  CREATE INDEX "payload_locked_documents_rels_seasons_id_idx" ON "payload_locked_documents_rels" USING btree ("seasons_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "seasons" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_seasons_v" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "seasons" CASCADE;
  DROP TABLE "_seasons_v" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT IF EXISTS "posts_season_id_seasons_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT IF EXISTS "_posts_v_version_season_id_seasons_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_seasons_fk";
  
  DROP INDEX "posts_season_idx";
  DROP INDEX "_posts_v_version_version_season_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_seasons_id_idx";
  ALTER TABLE "posts" DROP COLUMN "season_id";
  ALTER TABLE "posts" DROP COLUMN "episode_number";
  ALTER TABLE "posts" DROP COLUMN "episode_type";
  ALTER TABLE "_posts_v" DROP COLUMN "version_season_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_episode_number";
  ALTER TABLE "_posts_v" DROP COLUMN "version_episode_type";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "seasons_id";
  DROP TYPE "public"."enum_posts_episode_type";
  DROP TYPE "public"."enum__posts_v_version_episode_type";
  DROP TYPE "public"."enum_seasons_status";
  DROP TYPE "public"."enum__seasons_v_version_status";`)
}
