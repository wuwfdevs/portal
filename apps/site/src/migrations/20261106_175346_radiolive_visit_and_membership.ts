import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "radiolive_hub_visit_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "radiolive_hub" ADD COLUMN "visit_heading" varchar DEFAULT 'Plan your visit';
  ALTER TABLE "radiolive_hub" ADD COLUMN "membership_heading" varchar;
  ALTER TABLE "radiolive_hub" ADD COLUMN "membership_text" varchar;
  ALTER TABLE "radiolive_hub" ADD COLUMN "membership_contact_name" varchar;
  ALTER TABLE "radiolive_hub" ADD COLUMN "membership_contact_email" varchar;
  ALTER TABLE "radiolive_hub" ADD COLUMN "membership_contact_phone" varchar;
  ALTER TABLE "radiolive_hub" ADD COLUMN "membership_href" varchar;
  ALTER TABLE "radiolive_hub_visit_items" ADD CONSTRAINT "radiolive_hub_visit_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."radiolive_hub"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "radiolive_hub_visit_items_order_idx" ON "radiolive_hub_visit_items" USING btree ("_order");
  CREATE INDEX "radiolive_hub_visit_items_parent_id_idx" ON "radiolive_hub_visit_items" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "radiolive_hub_visit_items" CASCADE;
  ALTER TABLE "radiolive_hub" DROP COLUMN "visit_heading";
  ALTER TABLE "radiolive_hub" DROP COLUMN "membership_heading";
  ALTER TABLE "radiolive_hub" DROP COLUMN "membership_text";
  ALTER TABLE "radiolive_hub" DROP COLUMN "membership_contact_name";
  ALTER TABLE "radiolive_hub" DROP COLUMN "membership_contact_email";
  ALTER TABLE "radiolive_hub" DROP COLUMN "membership_contact_phone";
  ALTER TABLE "radiolive_hub" DROP COLUMN "membership_href";`)
}
