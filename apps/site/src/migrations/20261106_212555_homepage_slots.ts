import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" ADD COLUMN "video_row_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage" ADD COLUMN "video_row_series_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "video_row_count" numeric DEFAULT 6;
  ALTER TABLE "homepage" ADD COLUMN "podcasts_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage" ADD COLUMN "podcasts_featured_show_id" integer;
  ALTER TABLE "homepage" ADD COLUMN "radio_live_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage" ADD COLUMN "unearthing_enabled" boolean DEFAULT true;
  ALTER TABLE "homepage" ADD COLUMN "unearthing_episode_id" integer;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_video_row_series_id_series_id_fk" FOREIGN KEY ("video_row_series_id") REFERENCES "public"."series"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_podcasts_featured_show_id_productions_id_fk" FOREIGN KEY ("podcasts_featured_show_id") REFERENCES "public"."productions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_unearthing_episode_id_posts_id_fk" FOREIGN KEY ("unearthing_episode_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "homepage_video_row_video_row_series_idx" ON "homepage" USING btree ("video_row_series_id");
  CREATE INDEX "homepage_podcasts_podcasts_featured_show_idx" ON "homepage" USING btree ("podcasts_featured_show_id");
  CREATE INDEX "homepage_unearthing_unearthing_episode_idx" ON "homepage" USING btree ("unearthing_episode_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "homepage" DROP CONSTRAINT "homepage_video_row_series_id_series_id_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_podcasts_featured_show_id_productions_id_fk";
  
  ALTER TABLE "homepage" DROP CONSTRAINT "homepage_unearthing_episode_id_posts_id_fk";
  
  DROP INDEX "homepage_video_row_video_row_series_idx";
  DROP INDEX "homepage_podcasts_podcasts_featured_show_idx";
  DROP INDEX "homepage_unearthing_unearthing_episode_idx";
  ALTER TABLE "homepage" DROP COLUMN "video_row_enabled";
  ALTER TABLE "homepage" DROP COLUMN "video_row_series_id";
  ALTER TABLE "homepage" DROP COLUMN "video_row_count";
  ALTER TABLE "homepage" DROP COLUMN "podcasts_enabled";
  ALTER TABLE "homepage" DROP COLUMN "podcasts_featured_show_id";
  ALTER TABLE "homepage" DROP COLUMN "radio_live_enabled";
  ALTER TABLE "homepage" DROP COLUMN "unearthing_enabled";
  ALTER TABLE "homepage" DROP COLUMN "unearthing_episode_id";`)
}
