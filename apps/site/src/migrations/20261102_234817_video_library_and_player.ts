import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "posts_blocks_video_player" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"poster_id" integer,
  	"block_name" varchar
  );
  
  CREATE TABLE "_posts_v_blocks_video_player" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" serial PRIMARY KEY NOT NULL,
  	"video_id" integer,
  	"title" varchar,
  	"caption" varchar,
  	"poster_id" integer,
  	"_uuid" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE "video" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"credit" varchar,
  	"duration_seconds" numeric,
  	"poster_id" integer,
  	"legacy_source_url" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "video_id" integer;
  ALTER TABLE "posts_blocks_video_player" ADD CONSTRAINT "posts_blocks_video_player_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_video_player" ADD CONSTRAINT "posts_blocks_video_player_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "posts_blocks_video_player" ADD CONSTRAINT "posts_blocks_video_player_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_video_player" ADD CONSTRAINT "_posts_v_blocks_video_player_video_id_video_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_video_player" ADD CONSTRAINT "_posts_v_blocks_video_player_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_posts_v_blocks_video_player" ADD CONSTRAINT "_posts_v_blocks_video_player_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."_posts_v"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "video" ADD CONSTRAINT "video_poster_id_media_id_fk" FOREIGN KEY ("poster_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "posts_blocks_video_player_order_idx" ON "posts_blocks_video_player" USING btree ("_order");
  CREATE INDEX "posts_blocks_video_player_parent_id_idx" ON "posts_blocks_video_player" USING btree ("_parent_id");
  CREATE INDEX "posts_blocks_video_player_path_idx" ON "posts_blocks_video_player" USING btree ("_path");
  CREATE INDEX "posts_blocks_video_player_video_idx" ON "posts_blocks_video_player" USING btree ("video_id");
  CREATE INDEX "posts_blocks_video_player_poster_idx" ON "posts_blocks_video_player" USING btree ("poster_id");
  CREATE INDEX "_posts_v_blocks_video_player_order_idx" ON "_posts_v_blocks_video_player" USING btree ("_order");
  CREATE INDEX "_posts_v_blocks_video_player_parent_id_idx" ON "_posts_v_blocks_video_player" USING btree ("_parent_id");
  CREATE INDEX "_posts_v_blocks_video_player_path_idx" ON "_posts_v_blocks_video_player" USING btree ("_path");
  CREATE INDEX "_posts_v_blocks_video_player_video_idx" ON "_posts_v_blocks_video_player" USING btree ("video_id");
  CREATE INDEX "_posts_v_blocks_video_player_poster_idx" ON "_posts_v_blocks_video_player" USING btree ("poster_id");
  CREATE INDEX "video_title_idx" ON "video" USING btree ("title");
  CREATE INDEX "video_credit_idx" ON "video" USING btree ("credit");
  CREATE INDEX "video_poster_idx" ON "video" USING btree ("poster_id");
  CREATE UNIQUE INDEX "video_legacy_legacy_source_url_idx" ON "video" USING btree ("legacy_source_url");
  CREATE INDEX "video_updated_at_idx" ON "video" USING btree ("updated_at");
  CREATE INDEX "video_created_at_idx" ON "video" USING btree ("created_at");
  CREATE UNIQUE INDEX "video_filename_idx" ON "video" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_video_fk" FOREIGN KEY ("video_id") REFERENCES "public"."video"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_video_id_idx" ON "payload_locked_documents_rels" USING btree ("video_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "posts_blocks_video_player" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_video_player" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "video" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "posts_blocks_video_player" CASCADE;
  DROP TABLE "_posts_v_blocks_video_player" CASCADE;
  DROP TABLE "video" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_video_fk";
  
  DROP INDEX "payload_locked_documents_rels_video_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "video_id";`)
}
