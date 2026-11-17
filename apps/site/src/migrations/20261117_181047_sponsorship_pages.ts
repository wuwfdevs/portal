import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Sponsorship global (boards 16 to 20b). Creates its tables and starts it with the two programs board 19 shows, RadioLive
 * and the WUWF Book Club, so /sponsor/events is not empty on a new or migrated database. Their levels carry no price, so each
 * reads "Priced on request"; levels, recognition and whether each is open are corporate support's to confirm in the admin.
 * The starting rows are written only into a global that has none (an editor's rows are never touched). `down` drops the tables.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sponsorship_programs_kind" AS ENUM('live-series', 'festival', 'community-program', 'other');
  CREATE TYPE "public"."enum_sponsorship_programs_status" AS ENUM('open', 'held', 'not-yet-open');
  CREATE TABLE "sponsorship_programs_levels" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"price" varchar
  );
  
  CREATE TABLE "sponsorship_programs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_sponsorship_programs_kind" DEFAULT 'live-series' NOT NULL,
  	"status" "enum_sponsorship_programs_status" DEFAULT 'open' NOT NULL,
  	"description" varchar NOT NULL,
  	"recognition" varchar,
  	"page_url" varchar
  );
  
  CREATE TABLE "sponsorship" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"inquiry_notice" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "sponsorship_programs_levels" ADD CONSTRAINT "sponsorship_programs_levels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_programs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_programs" ADD CONSTRAINT "sponsorship_programs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sponsorship_programs_levels_order_idx" ON "sponsorship_programs_levels" USING btree ("_order");
  CREATE INDEX "sponsorship_programs_levels_parent_id_idx" ON "sponsorship_programs_levels" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_programs_order_idx" ON "sponsorship_programs" USING btree ("_order");
  CREATE INDEX "sponsorship_programs_parent_id_idx" ON "sponsorship_programs" USING btree ("_parent_id");`)

  // Starting rows. Payload gives every array row a varchar id; md5 of a random value is enough here.
  await db.execute(sql`
  INSERT INTO "sponsorship" ("updated_at", "created_at") SELECT now(), now() WHERE NOT EXISTS (SELECT 1 FROM "sponsorship");

  INSERT INTO "sponsorship_programs" ("_order", "_parent_id", "id", "name", "kind", "status", "description")
  SELECT v."_order", (SELECT min("id") FROM "sponsorship"), v."id", v."name", v."kind"::"enum_sponsorship_programs_kind", 'open', v."description"
  FROM (VALUES
    (1, 'starter-radiolive', 'RadioLive', 'live-series',
     'Every month, WUWF puts live musicians on stage. Each show is recorded, then broadcast as RadioLive Encore and shared on video. A partnership puts your business alongside live music, in front of people who came out to be there.'),
    (2, 'starter-book-club', 'The WUWF Book Club', 'community-program',
     'A free reading community for people who love books and public radio. Members vote on what to read, talk it over online and meet in person at author salons. A partnership puts your business alongside readers who show up, online and in person.')
  ) AS v("_order", "id", "name", "kind", "description")
  WHERE NOT EXISTS (SELECT 1 FROM "sponsorship_programs");

  INSERT INTO "sponsorship_programs_levels" ("_order", "_parent_id", "id", "name", "description")
  SELECT v."_order", v."parent", v."id", v."name", v."description"
  FROM (VALUES
    (1, 'starter-radiolive', 'starter-radiolive-presenting', 'Presenting partner', 'The series, across the season.'),
    (2, 'starter-radiolive', 'starter-radiolive-show', 'Show partner', 'A single performance.'),
    (1, 'starter-book-club', 'starter-book-club-partner', 'Book Club partner', 'The program, across the year.')
  ) AS v("_order", "parent", "id", "name", "description")
  WHERE EXISTS (SELECT 1 FROM "sponsorship_programs" WHERE "id" = v."parent")
    AND NOT EXISTS (SELECT 1 FROM "sponsorship_programs_levels");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "sponsorship_programs_levels" CASCADE;
  DROP TABLE "sponsorship_programs" CASCADE;
  DROP TABLE "sponsorship" CASCADE;
  DROP TYPE "public"."enum_sponsorship_programs_kind";
  DROP TYPE "public"."enum_sponsorship_programs_status";`)
}
