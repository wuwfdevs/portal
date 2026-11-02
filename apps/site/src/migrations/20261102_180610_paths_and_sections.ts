import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "sections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"generate_slug" boolean DEFAULT true,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "pages" ADD COLUMN "path" varchar;
  ALTER TABLE "_pages_v" ADD COLUMN "version_path" varchar;
  ALTER TABLE "posts" ADD COLUMN "section_id" integer;
  ALTER TABLE "posts" ADD COLUMN "path" varchar;
  ALTER TABLE "_posts_v" ADD COLUMN "version_section_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_path" varchar;
  ALTER TABLE "search" ADD COLUMN "path" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sections_id" integer;
  CREATE UNIQUE INDEX "sections_slug_idx" ON "sections" USING btree ("slug");
  CREATE INDEX "sections_updated_at_idx" ON "sections" USING btree ("updated_at");
  CREATE INDEX "sections_created_at_idx" ON "sections" USING btree ("created_at");
  ALTER TABLE "posts" ADD CONSTRAINT "posts_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v" ADD CONSTRAINT "_posts_v_version_section_id_sections_id_fk" FOREIGN KEY ("version_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "pages_path_idx" ON "pages" USING btree ("path");
  CREATE INDEX "_pages_v_version_version_path_idx" ON "_pages_v" USING btree ("version_path");
  CREATE INDEX "posts_section_idx" ON "posts" USING btree ("section_id");
  CREATE UNIQUE INDEX "posts_path_idx" ON "posts" USING btree ("path");
  CREATE INDEX "_posts_v_version_version_section_idx" ON "_posts_v" USING btree ("version_section_id");
  CREATE INDEX "_posts_v_version_version_path_idx" ON "_posts_v" USING btree ("version_path");
  CREATE INDEX "search_path_idx" ON "search" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("sections_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sections" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sections" CASCADE;
  ALTER TABLE "posts" DROP CONSTRAINT "posts_section_id_sections_id_fk";
  
  ALTER TABLE "_posts_v" DROP CONSTRAINT "_posts_v_version_section_id_sections_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sections_fk";
  
  DROP INDEX "pages_path_idx";
  DROP INDEX "_pages_v_version_version_path_idx";
  DROP INDEX "posts_section_idx";
  DROP INDEX "posts_path_idx";
  DROP INDEX "_posts_v_version_version_section_idx";
  DROP INDEX "_posts_v_version_version_path_idx";
  DROP INDEX "search_path_idx";
  DROP INDEX "payload_locked_documents_rels_sections_id_idx";
  ALTER TABLE "pages" DROP COLUMN "path";
  ALTER TABLE "_pages_v" DROP COLUMN "version_path";
  ALTER TABLE "posts" DROP COLUMN "section_id";
  ALTER TABLE "posts" DROP COLUMN "path";
  ALTER TABLE "_posts_v" DROP COLUMN "version_section_id";
  ALTER TABLE "_posts_v" DROP COLUMN "version_path";
  ALTER TABLE "search" DROP COLUMN "path";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "sections_id";`)
}
