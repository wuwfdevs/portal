import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // A live blog is now a story (a post with format "live"). This migration does not move live blogs: it only prepares the
  // story tables and repoints live updates at stories. If any live blog or update exists, stop before changing anything, so
  // nothing can be lost or left pointing at the wrong record. (None were ever imported; only test data could be here.)
  await db.execute(sql`
   DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "live_posts") OR EXISTS (SELECT 1 FROM "_live_posts_v") OR EXISTS (SELECT 1 FROM "live_updates") THEN
      RAISE EXCEPTION 'live blogs or live updates already exist: recreate them as stories (format "live") by hand, delete them, then run this migration again';
    END IF;
  END $$;`)
  await db.execute(sql`
   CREATE TYPE "public"."enum_posts_live_coverage" AS ENUM('live', 'ended');
  CREATE TYPE "public"."enum__posts_v_version_live_coverage" AS ENUM('live', 'ended');
  ALTER TYPE "public"."enum_posts_format" ADD VALUE 'live';
  ALTER TYPE "public"."enum__posts_v_version_format" ADD VALUE 'live';
  ALTER TABLE "live_updates" DROP CONSTRAINT "live_updates_live_post_id_live_posts_id_fk";
  
  ALTER TABLE "posts" ADD COLUMN "live_coverage" "enum_posts_live_coverage" DEFAULT 'live';
  ALTER TABLE "posts" ADD COLUMN "live_ended_at" timestamp(3) with time zone;
  ALTER TABLE "posts_rels" ADD COLUMN "live_updates_id" integer;
  ALTER TABLE "_posts_v" ADD COLUMN "version_live_coverage" "enum__posts_v_version_live_coverage" DEFAULT 'live';
  ALTER TABLE "_posts_v" ADD COLUMN "version_live_ended_at" timestamp(3) with time zone;
  ALTER TABLE "_posts_v_rels" ADD COLUMN "live_updates_id" integer;
  ALTER TABLE "posts_rels" ADD CONSTRAINT "posts_rels_live_updates_fk" FOREIGN KEY ("live_updates_id") REFERENCES "public"."live_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_rels" ADD CONSTRAINT "_posts_v_rels_live_updates_fk" FOREIGN KEY ("live_updates_id") REFERENCES "public"."live_updates"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "live_updates" ADD CONSTRAINT "live_updates_live_post_id_posts_id_fk" FOREIGN KEY ("live_post_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_rels_live_updates_id_idx" ON "posts_rels" USING btree ("live_updates_id");
  CREATE INDEX "_posts_v_rels_live_updates_id_idx" ON "_posts_v_rels" USING btree ("live_updates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Going back means live blogs are a separate collection again; stories of that kind and their updates cannot be carried over.
  await db.execute(sql`
   DO $$
  BEGIN
    IF EXISTS (SELECT 1 FROM "posts" WHERE "format" = 'live') OR EXISTS (SELECT 1 FROM "live_updates") THEN
      RAISE EXCEPTION 'live blogs (stories with format live) or live updates exist: move or delete them before rolling this back';
    END IF;
  END $$;`)
  await db.execute(sql`
   ALTER TABLE "posts_rels" DROP CONSTRAINT IF EXISTS "posts_rels_live_updates_fk";
  
  ALTER TABLE "_posts_v_rels" DROP CONSTRAINT IF EXISTS "_posts_v_rels_live_updates_fk";
  
  ALTER TABLE "live_updates" DROP CONSTRAINT IF EXISTS "live_updates_live_post_id_posts_id_fk";
  
  ALTER TABLE "posts" ALTER COLUMN "format" SET DATA TYPE text;
  ALTER TABLE "posts" ALTER COLUMN "format" SET DEFAULT 'web'::text;
  DROP TYPE IF EXISTS "public"."enum_posts_format";
  CREATE TYPE "public"."enum_posts_format" AS ENUM('web', 'audio', 'video');
  ALTER TABLE "posts" ALTER COLUMN "format" SET DEFAULT 'web'::"public"."enum_posts_format";
  ALTER TABLE "posts" ALTER COLUMN "format" SET DATA TYPE "public"."enum_posts_format" USING "format"::"public"."enum_posts_format";
  ALTER TABLE "_posts_v" ALTER COLUMN "version_format" SET DATA TYPE text;
  ALTER TABLE "_posts_v" ALTER COLUMN "version_format" SET DEFAULT 'web'::text;
  DROP TYPE IF EXISTS "public"."enum__posts_v_version_format";
  CREATE TYPE "public"."enum__posts_v_version_format" AS ENUM('web', 'audio', 'video');
  ALTER TABLE "_posts_v" ALTER COLUMN "version_format" SET DEFAULT 'web'::"public"."enum__posts_v_version_format";
  ALTER TABLE "_posts_v" ALTER COLUMN "version_format" SET DATA TYPE "public"."enum__posts_v_version_format" USING "version_format"::"public"."enum__posts_v_version_format";
  DROP INDEX IF EXISTS "posts_rels_live_updates_id_idx";
  DROP INDEX IF EXISTS "_posts_v_rels_live_updates_id_idx";
  ALTER TABLE "live_updates" ADD CONSTRAINT "live_updates_live_post_id_live_posts_id_fk" FOREIGN KEY ("live_post_id") REFERENCES "public"."live_posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts" DROP COLUMN IF EXISTS "live_coverage";
  ALTER TABLE "posts" DROP COLUMN IF EXISTS "live_ended_at";
  ALTER TABLE "posts_rels" DROP COLUMN IF EXISTS "live_updates_id";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_live_coverage";
  ALTER TABLE "_posts_v" DROP COLUMN IF EXISTS "version_live_ended_at";
  ALTER TABLE "_posts_v_rels" DROP COLUMN IF EXISTS "live_updates_id";
  DROP TYPE IF EXISTS "public"."enum_posts_live_coverage";
  DROP TYPE IF EXISTS "public"."enum__posts_v_version_live_coverage";`)
}
