import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "fellowships_focus_areas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"blurb" varchar
  );
  
  ALTER TABLE "fellowships" ADD COLUMN "eyebrow" varchar DEFAULT 'A WUWF reporting fellowship';
  ALTER TABLE "fellowships" ADD COLUMN "mission_headline" varchar;
  ALTER TABLE "fellowships_focus_areas" ADD CONSTRAINT "fellowships_focus_areas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."fellowships"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "fellowships_focus_areas_order_idx" ON "fellowships_focus_areas" USING btree ("_order");
  CREATE INDEX "fellowships_focus_areas_parent_id_idx" ON "fellowships_focus_areas" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "fellowships_focus_areas" CASCADE;
  ALTER TABLE "fellowships" DROP COLUMN "eyebrow";
  ALTER TABLE "fellowships" DROP COLUMN "mission_headline";`)
}
