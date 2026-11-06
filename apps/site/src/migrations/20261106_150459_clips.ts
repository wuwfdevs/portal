import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_clips_status" AS ENUM('draft', 'published');
  CREATE TYPE "public"."enum__clips_v_version_status" AS ENUM('draft', 'published');
  CREATE TABLE "clips" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar,
  	"description" varchar,
  	"video_id" integer,
  	"captions_vtt" varchar,
  	"series_id" integer,
  	"story_id" integer,
  	"cta_label" varchar,
  	"published_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"_status" "enum_clips_status" DEFAULT 'draft'
  );
  
  CREATE TABLE "clips_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"contributors_id" integer
  );
  
  CREATE TABLE "_clips_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar,
  	"version_generate_slug" boolean DEFAULT true,
  	"version_slug" varchar,
  	"version_description" varchar,
  	"version_video_id" integer,
  	"version_captions_vtt" varchar,
  	"version_series_id" integer,
  	"version_story_id" integer,
  	"version_cta_label" varchar,
  	"version_published_at" timestamp(3) with time zone,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"version__status" "enum__clips_v_version_status" DEFAULT 'draft',
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"latest" boolean
  );
  
  CREATE TABLE "_clips_v_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"contributors_id" integer
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "clips_id" integer;
  ALTER TABLE "clips" ADD CONSTRAINT "clips_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clips" ADD CONSTRAINT "clips_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clips" ADD CONSTRAINT "clips_story_id_posts_id_fk" FOREIGN KEY ("story_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "clips_rels" ADD CONSTRAINT "clips_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "clips_rels" ADD CONSTRAINT "clips_rels_contributors_fk" FOREIGN KEY ("contributors_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_clips_v" ADD CONSTRAINT "_clips_v_parent_id_clips_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."clips"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clips_v" ADD CONSTRAINT "_clips_v_version_video_id_video_id_fk" FOREIGN KEY ("version_video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clips_v" ADD CONSTRAINT "_clips_v_version_series_id_series_id_fk" FOREIGN KEY ("version_series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clips_v" ADD CONSTRAINT "_clips_v_version_story_id_posts_id_fk" FOREIGN KEY ("version_story_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_clips_v_rels" ADD CONSTRAINT "_clips_v_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."_clips_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_clips_v_rels" ADD CONSTRAINT "_clips_v_rels_contributors_fk" FOREIGN KEY ("contributors_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "clips_slug_idx" ON "clips" USING btree ("slug");
  CREATE INDEX "clips_video_idx" ON "clips" USING btree ("video_id");
  CREATE INDEX "clips_series_idx" ON "clips" USING btree ("series_id");
  CREATE INDEX "clips_story_idx" ON "clips" USING btree ("story_id");
  CREATE INDEX "clips_updated_at_idx" ON "clips" USING btree ("updated_at");
  CREATE INDEX "clips_created_at_idx" ON "clips" USING btree ("created_at");
  CREATE INDEX "clips__status_idx" ON "clips" USING btree ("_status");
  CREATE INDEX "clips_rels_order_idx" ON "clips_rels" USING btree ("order");
  CREATE INDEX "clips_rels_parent_idx" ON "clips_rels" USING btree ("parent_id");
  CREATE INDEX "clips_rels_path_idx" ON "clips_rels" USING btree ("path");
  CREATE INDEX "clips_rels_contributors_id_idx" ON "clips_rels" USING btree ("contributors_id");
  CREATE INDEX "_clips_v_parent_idx" ON "_clips_v" USING btree ("parent_id");
  CREATE INDEX "_clips_v_version_version_slug_idx" ON "_clips_v" USING btree ("version_slug");
  CREATE INDEX "_clips_v_version_version_video_idx" ON "_clips_v" USING btree ("version_video_id");
  CREATE INDEX "_clips_v_version_version_series_idx" ON "_clips_v" USING btree ("version_series_id");
  CREATE INDEX "_clips_v_version_version_story_idx" ON "_clips_v" USING btree ("version_story_id");
  CREATE INDEX "_clips_v_version_version_updated_at_idx" ON "_clips_v" USING btree ("version_updated_at");
  CREATE INDEX "_clips_v_version_version_created_at_idx" ON "_clips_v" USING btree ("version_created_at");
  CREATE INDEX "_clips_v_version_version__status_idx" ON "_clips_v" USING btree ("version__status");
  CREATE INDEX "_clips_v_created_at_idx" ON "_clips_v" USING btree ("created_at");
  CREATE INDEX "_clips_v_updated_at_idx" ON "_clips_v" USING btree ("updated_at");
  CREATE INDEX "_clips_v_latest_idx" ON "_clips_v" USING btree ("latest");
  CREATE INDEX "_clips_v_rels_order_idx" ON "_clips_v_rels" USING btree ("order");
  CREATE INDEX "_clips_v_rels_parent_idx" ON "_clips_v_rels" USING btree ("parent_id");
  CREATE INDEX "_clips_v_rels_path_idx" ON "_clips_v_rels" USING btree ("path");
  CREATE INDEX "_clips_v_rels_contributors_id_idx" ON "_clips_v_rels" USING btree ("contributors_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_clips_fk" FOREIGN KEY ("clips_id") REFERENCES "public"."clips"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_clips_id_idx" ON "payload_locked_documents_rels" USING btree ("clips_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "clips" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "clips_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_clips_v" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_clips_v_rels" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "clips" CASCADE;
  DROP TABLE "clips_rels" CASCADE;
  DROP TABLE "_clips_v" CASCADE;
  DROP TABLE "_clips_v_rels" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_clips_fk";
  
  DROP INDEX "payload_locked_documents_rels_clips_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "clips_id";
  DROP TYPE "public"."enum_clips_status";
  DROP TYPE "public"."enum__clips_v_version_status";`)
}
