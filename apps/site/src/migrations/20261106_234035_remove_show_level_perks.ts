import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "productions_show_support_perks" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "productions_show_support_perks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"level" varchar,
  	"title" varchar,
  	"description" varchar
  );
  
  ALTER TABLE "productions_show_support_perks" ADD CONSTRAINT "productions_show_support_perks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "productions_show_support_perks_order_idx" ON "productions_show_support_perks" USING btree ("_order");
  CREATE INDEX "productions_show_support_perks_parent_id_idx" ON "productions_show_support_perks" USING btree ("_parent_id");`)
}
