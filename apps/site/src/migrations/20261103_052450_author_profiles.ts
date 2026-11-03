import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "contributors_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  ALTER TABLE "contributors" ADD COLUMN "biography" jsonb;
  ALTER TABLE "contributors" ADD COLUMN "legacy_legacy_path" varchar;
  ALTER TABLE "contributors" ADD COLUMN "legacy_grove_id" varchar;
  ALTER TABLE "contributors_links" ADD CONSTRAINT "contributors_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."contributors"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "contributors_links_order_idx" ON "contributors_links" USING btree ("_order");
  CREATE INDEX "contributors_links_parent_id_idx" ON "contributors_links" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "contributors_legacy_legacy_legacy_path_idx" ON "contributors" USING btree ("legacy_legacy_path");
  CREATE UNIQUE INDEX "contributors_legacy_legacy_grove_id_idx" ON "contributors" USING btree ("legacy_grove_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "contributors_links" CASCADE;
  DROP INDEX IF EXISTS "contributors_legacy_legacy_legacy_path_idx";
  DROP INDEX IF EXISTS "contributors_legacy_legacy_grove_id_idx";
  ALTER TABLE "contributors" DROP COLUMN IF EXISTS "biography";
  ALTER TABLE "contributors" DROP COLUMN IF EXISTS "legacy_legacy_path";
  ALTER TABLE "contributors" DROP COLUMN IF EXISTS "legacy_grove_id";`)
}
