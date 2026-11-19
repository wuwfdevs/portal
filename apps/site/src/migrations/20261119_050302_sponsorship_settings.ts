import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sponsorship_settings_programs_kind" AS ENUM('live-series', 'festival', 'community-program', 'other');
  CREATE TYPE "public"."enum_sponsorship_settings_programs_status" AS ENUM('open', 'held', 'not-yet-open');
  CREATE TABLE "sponsorship_settings_interests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_settings_budgets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_settings_dayparts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"when" varchar,
  	"open" numeric NOT NULL,
  	"m3" numeric NOT NULL,
  	"m6" numeric NOT NULL,
  	"y1" numeric NOT NULL
  );
  
  CREATE TABLE "sponsorship_settings_credit_counts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"count" numeric NOT NULL
  );
  
  CREATE TABLE "sponsorship_settings_packages_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"price" numeric NOT NULL,
  	"value" numeric NOT NULL
  );
  
  CREATE TABLE "sponsorship_settings_programs_levels" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"price" varchar
  );
  
  CREATE TABLE "sponsorship_settings_programs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"kind" "enum_sponsorship_settings_programs_kind" DEFAULT 'live-series' NOT NULL,
  	"status" "enum_sponsorship_settings_programs_status" DEFAULT 'open' NOT NULL,
  	"description" varchar NOT NULL,
  	"recognition" varchar,
  	"page_url" varchar
  );
  
  CREATE TABLE "sponsorship_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"phone" varchar,
  	"address" varchar,
  	"service_line" varchar,
  	"inquiry_email" varchar,
  	"inquiry_notice" varchar,
  	"not_set_up_message" varchar,
  	"failed_message" varchar,
  	"prepay_percent" numeric,
  	"nonprofit_percent" numeric,
  	"carpool_six_months" numeric,
  	"carpool_one_year" numeric,
  	"packages_open_drive_rate" numeric,
  	"packages_new_drive_rate" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "sponsorship_settings_interests" ADD CONSTRAINT "sponsorship_settings_interests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_settings_budgets" ADD CONSTRAINT "sponsorship_settings_budgets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_settings_dayparts" ADD CONSTRAINT "sponsorship_settings_dayparts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_settings_credit_counts" ADD CONSTRAINT "sponsorship_settings_credit_counts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_settings_packages_items" ADD CONSTRAINT "sponsorship_settings_packages_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_settings_programs_levels" ADD CONSTRAINT "sponsorship_settings_programs_levels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings_programs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_settings_programs" ADD CONSTRAINT "sponsorship_settings_programs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sponsorship_settings_interests_order_idx" ON "sponsorship_settings_interests" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_interests_parent_id_idx" ON "sponsorship_settings_interests" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_settings_budgets_order_idx" ON "sponsorship_settings_budgets" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_budgets_parent_id_idx" ON "sponsorship_settings_budgets" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_settings_dayparts_order_idx" ON "sponsorship_settings_dayparts" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_dayparts_parent_id_idx" ON "sponsorship_settings_dayparts" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_settings_credit_counts_order_idx" ON "sponsorship_settings_credit_counts" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_credit_counts_parent_id_idx" ON "sponsorship_settings_credit_counts" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_settings_packages_items_order_idx" ON "sponsorship_settings_packages_items" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_packages_items_parent_id_idx" ON "sponsorship_settings_packages_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_settings_programs_levels_order_idx" ON "sponsorship_settings_programs_levels" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_programs_levels_parent_id_idx" ON "sponsorship_settings_programs_levels" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_settings_programs_order_idx" ON "sponsorship_settings_programs" USING btree ("_order");
  CREATE INDEX "sponsorship_settings_programs_parent_id_idx" ON "sponsorship_settings_programs" USING btree ("_parent_id");`)

  // The data blocks' numbers and the contact details move out of the page global (PAGE-BLOCKS.md phase 3): copied here, in SQL, so this
  // migration does not depend on the config as it will be when it replays. The old global keeps its copy until the pages are confirmed (phase 7
  // drops it). Nothing to copy where the old global has no row (the settings global is then simply empty).
  await db.execute(sql`
  INSERT INTO "sponsorship_settings" ("id", "phone", "address", "service_line", "inquiry_email", "inquiry_notice", "not_set_up_message", "failed_message", "prepay_percent", "nonprofit_percent", "carpool_six_months", "carpool_one_year", "packages_open_drive_rate", "packages_new_drive_rate", "updated_at", "created_at")
    SELECT 1, "phone", "address", "service_line", "inquiry_email", "inquiry_notice", "hub_inquiry_not_set_up_message", "hub_inquiry_failed_message", "on_air_rates_prepay_percent", "on_air_rates_nonprofit_percent", "on_air_carpool_six_months", "on_air_carpool_one_year", "on_air_packages_open_drive_rate", "on_air_packages_new_drive_rate", now(), now()
    FROM "sponsorship" ORDER BY "id" LIMIT 1;
  SELECT setval(pg_get_serial_sequence('sponsorship_settings', 'id'), COALESCE((SELECT max("id") FROM "sponsorship_settings"), 1), (SELECT count(*) > 0 FROM "sponsorship_settings"));
  INSERT INTO "sponsorship_settings_interests" ("_order", "_parent_id", "id", "label") SELECT "_order", 1, "id", "label" FROM "sponsorship_interests" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");
  INSERT INTO "sponsorship_settings_budgets" ("_order", "_parent_id", "id", "label") SELECT "_order", 1, "id", "label" FROM "sponsorship_budgets" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");
  INSERT INTO "sponsorship_settings_dayparts" ("_order", "_parent_id", "id", "label", "when", "open", "m3", "m6", "y1") SELECT "_order", 1, "id", "label", "when", "open", "m3", "m6", "y1" FROM "sponsorship_on_air_rates_dayparts" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");
  INSERT INTO "sponsorship_settings_credit_counts" ("_order", "_parent_id", "id", "count") SELECT "_order", 1, "id", "count" FROM "sponsorship_on_air_rates_credit_counts" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");
  INSERT INTO "sponsorship_settings_packages_items" ("_order", "_parent_id", "id", "name", "description", "price", "value") SELECT "_order", 1, "id", "name", "description", "price", "value" FROM "sponsorship_on_air_packages_items" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");
  INSERT INTO "sponsorship_settings_programs" ("_order", "_parent_id", "id", "name", "kind", "status", "description", "recognition", "page_url") SELECT "_order", 1, "id", "name", "kind"::text::"enum_sponsorship_settings_programs_kind", "status"::text::"enum_sponsorship_settings_programs_status", "description", "recognition", "page_url" FROM "sponsorship_programs" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");
  INSERT INTO "sponsorship_settings_programs_levels" ("_order", "_parent_id", "id", "name", "description", "price") SELECT "_order", "_parent_id", "id", "name", "description", "price" FROM "sponsorship_programs_levels" WHERE EXISTS (SELECT 1 FROM "sponsorship_settings");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "sponsorship_settings_interests" CASCADE;
  DROP TABLE "sponsorship_settings_budgets" CASCADE;
  DROP TABLE "sponsorship_settings_dayparts" CASCADE;
  DROP TABLE "sponsorship_settings_credit_counts" CASCADE;
  DROP TABLE "sponsorship_settings_packages_items" CASCADE;
  DROP TABLE "sponsorship_settings_programs_levels" CASCADE;
  DROP TABLE "sponsorship_settings_programs" CASCADE;
  DROP TABLE "sponsorship_settings" CASCADE;
  DROP TYPE "public"."enum_sponsorship_settings_programs_kind";
  DROP TYPE "public"."enum_sponsorship_settings_programs_status";`)
}
