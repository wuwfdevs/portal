import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "listen_live_channels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"short" varchar,
  	"stream_url" varchar NOT NULL,
  	"cadence_channel_id" varchar,
  	"description" varchar
  );
  
  CREATE TABLE "listen_live_other_ways" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar NOT NULL,
  	"link_label" varchar,
  	"link_url" varchar
  );
  
  CREATE TABLE "listen_live" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "header" ADD COLUMN "actions_listen_show" boolean DEFAULT true;
  ALTER TABLE "header" ADD COLUMN "actions_listen_label" varchar DEFAULT 'Listen live';
  ALTER TABLE "listen_live_channels" ADD CONSTRAINT "listen_live_channels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listen_live"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "listen_live_other_ways" ADD CONSTRAINT "listen_live_other_ways_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."listen_live"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "listen_live_channels_order_idx" ON "listen_live_channels" USING btree ("_order");
  CREATE INDEX "listen_live_channels_parent_id_idx" ON "listen_live_channels" USING btree ("_parent_id");
  CREATE INDEX "listen_live_other_ways_order_idx" ON "listen_live_other_ways" USING btree ("_order");
  CREATE INDEX "listen_live_other_ways_parent_id_idx" ON "listen_live_other_ways" USING btree ("_parent_id");`)

  // WUWF's three live streams as wuwf.org's own player lists them, and each channel's NPR Cadence ID from its schedule
  // pages (both read 2026-11-07; ROADMAP.md, board 26). Editors change these in Site settings → Listen live.
  await db.execute(sql`
  INSERT INTO "listen_live" ("id", "updated_at", "created_at") VALUES (1, now(), now()) ON CONFLICT ("id") DO NOTHING;
  INSERT INTO "listen_live_channels" ("_order", "_parent_id", "id", "name", "short", "stream_url", "cadence_channel_id", "description") VALUES
    (1, 1, 'seed-channel-fm', 'WUWF 88.1', '88.1', 'https://wuwf.streamguys1.com/WUWFFM.mp3', 'eed45825-935f-4185-8b47-059fcc96a6a6', 'News and information from NPR and WUWF.'),
    (2, 1, 'seed-channel-hd2', 'WUWF HD2 Classical', 'HD2', 'https://wuwf.streamguys1.com/WUWFHD2.mp3', 'ad7c1f78-645e-4cf2-8b38-88f8519b7464', 'Classical music.'),
    (3, 1, 'seed-channel-hd3', 'WUWF HD3', 'HD3', 'https://wuwf.streamguys1.com/WUWFHD3.mp3', '75d8ec9d-cfc5-45b8-aec9-5bdeb6cd1fd4', NULL)
  ON CONFLICT ("id") DO NOTHING;
  INSERT INTO "listen_live_other_ways" ("_order", "_parent_id", "id", "title", "text", "link_label", "link_url") VALUES
    (1, 1, 'seed-way-radio', 'On the radio', '88.1 FM in Pensacola. On HD Radio: HD2 Classical and HD3.', NULL, NULL),
    (2, 1, 'seed-way-podcasts', 'Any time', 'Missed something? Shows are on demand as podcasts.', 'Browse podcasts', '/podcasts')
  ON CONFLICT ("id") DO NOTHING;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "listen_live_channels" CASCADE;
  DROP TABLE "listen_live_other_ways" CASCADE;
  DROP TABLE "listen_live" CASCADE;
  ALTER TABLE "header" DROP COLUMN "actions_listen_show";
  ALTER TABLE "header" DROP COLUMN "actions_listen_label";`)
}
