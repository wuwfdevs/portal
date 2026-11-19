import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_giving_settings_levels_emphasis" AS ENUM('standard', 'featured', 'leadership');
  CREATE TABLE "giving_settings_levels_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "giving_settings_levels_gift_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "giving_settings_levels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"amount" varchar,
  	"minimum_monthly" numeric NOT NULL,
  	"description" varchar,
  	"emphasis" "enum_giving_settings_levels_emphasis" DEFAULT 'standard'
  );
  
  CREATE TABLE "giving_settings_message_tiers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"yearly" numeric NOT NULL,
  	"count" numeric NOT NULL
  );
  
  CREATE TABLE "giving_settings_monthly_amounts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"amount" numeric NOT NULL
  );
  
  CREATE TABLE "giving_settings_once_amounts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"amount" numeric NOT NULL
  );
  
  CREATE TABLE "giving_settings_gift_details" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "giving_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"phone" varchar,
  	"email" varchar,
  	"mailing_address" varchar,
  	"service_line" varchar,
  	"donation_form_monthly_address" varchar,
  	"donation_form_once_address" varchar,
  	"donation_form_address" varchar,
  	"donation_form_prefill" boolean DEFAULT false,
  	"donation_form_amount_param" varchar,
  	"donation_form_frequency_param" varchar,
  	"donation_form_monthly_value" varchar,
  	"donation_form_once_value" varchar,
  	"donation_form_not_set_up" varchar,
  	"members_listening_level" varchar,
  	"monthly_default" numeric,
  	"once_default" numeric,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "giving_settings_levels_benefits" ADD CONSTRAINT "giving_settings_levels_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings_levels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "giving_settings_levels_gift_benefits" ADD CONSTRAINT "giving_settings_levels_gift_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings_levels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "giving_settings_levels" ADD CONSTRAINT "giving_settings_levels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "giving_settings_message_tiers" ADD CONSTRAINT "giving_settings_message_tiers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "giving_settings_monthly_amounts" ADD CONSTRAINT "giving_settings_monthly_amounts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "giving_settings_once_amounts" ADD CONSTRAINT "giving_settings_once_amounts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "giving_settings_gift_details" ADD CONSTRAINT "giving_settings_gift_details_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."giving_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "giving_settings_levels_benefits_order_idx" ON "giving_settings_levels_benefits" USING btree ("_order");
  CREATE INDEX "giving_settings_levels_benefits_parent_id_idx" ON "giving_settings_levels_benefits" USING btree ("_parent_id");
  CREATE INDEX "giving_settings_levels_gift_benefits_order_idx" ON "giving_settings_levels_gift_benefits" USING btree ("_order");
  CREATE INDEX "giving_settings_levels_gift_benefits_parent_id_idx" ON "giving_settings_levels_gift_benefits" USING btree ("_parent_id");
  CREATE INDEX "giving_settings_levels_order_idx" ON "giving_settings_levels" USING btree ("_order");
  CREATE INDEX "giving_settings_levels_parent_id_idx" ON "giving_settings_levels" USING btree ("_parent_id");
  CREATE INDEX "giving_settings_message_tiers_order_idx" ON "giving_settings_message_tiers" USING btree ("_order");
  CREATE INDEX "giving_settings_message_tiers_parent_id_idx" ON "giving_settings_message_tiers" USING btree ("_parent_id");
  CREATE INDEX "giving_settings_monthly_amounts_order_idx" ON "giving_settings_monthly_amounts" USING btree ("_order");
  CREATE INDEX "giving_settings_monthly_amounts_parent_id_idx" ON "giving_settings_monthly_amounts" USING btree ("_parent_id");
  CREATE INDEX "giving_settings_once_amounts_order_idx" ON "giving_settings_once_amounts" USING btree ("_order");
  CREATE INDEX "giving_settings_once_amounts_parent_id_idx" ON "giving_settings_once_amounts" USING btree ("_parent_id");
  CREATE INDEX "giving_settings_gift_details_order_idx" ON "giving_settings_gift_details" USING btree ("_order");
  CREATE INDEX "giving_settings_gift_details_parent_id_idx" ON "giving_settings_gift_details" USING btree ("_parent_id");`)

  // The levels, amounts, addresses and contact details move out of the page global (PAGE-BLOCKS.md phase 4): copied here, in SQL, so this
  // migration does not depend on the config as it will be when it replays. The old global keeps its copy until the pages are confirmed (phase 7
  // drops it). Nothing to copy where the old global has no row (the settings global is then simply empty).
  await db.execute(sql`
  INSERT INTO "giving_settings" ("id", "phone", "email", "mailing_address", "service_line", "donation_form_monthly_address", "donation_form_once_address", "donation_form_address", "donation_form_prefill", "donation_form_amount_param", "donation_form_frequency_param", "donation_form_monthly_value", "donation_form_once_value", "donation_form_not_set_up", "members_listening_level", "monthly_default", "once_default", "updated_at", "created_at")
    SELECT 1, "phone", "email", "mailing_address", "service_line", "donation_form_monthly_address", "donation_form_once_address", "donation_form_address", "donation_form_prefill", "donation_form_amount_param", "donation_form_frequency_param", "donation_form_monthly_value", "donation_form_once_value", "donation_form_not_set_up", "members_listening_level", "give_card_monthly_default", "give_card_once_default", now(), now()
    FROM "support_page" ORDER BY "id" LIMIT 1;
  SELECT setval(pg_get_serial_sequence('giving_settings', 'id'), COALESCE((SELECT max("id") FROM "giving_settings"), 1), (SELECT count(*) > 0 FROM "giving_settings"));
  INSERT INTO "giving_settings_levels" ("_order", "_parent_id", "id", "name", "amount", "minimum_monthly", "description", "emphasis") SELECT "_order", 1, "id", "name", "amount", "minimum_monthly", "description", "emphasis"::text::"enum_giving_settings_levels_emphasis" FROM "support_page_levels" WHERE EXISTS (SELECT 1 FROM "giving_settings");
  INSERT INTO "giving_settings_levels_benefits" ("_order", "_parent_id", "id", "text") SELECT "_order", "_parent_id", "id", "text" FROM "support_page_levels_benefits" WHERE EXISTS (SELECT 1 FROM "giving_settings");
  INSERT INTO "giving_settings_levels_gift_benefits" ("_order", "_parent_id", "id", "text") SELECT "_order", "_parent_id", "id", "text" FROM "support_page_levels_gift_benefits" WHERE EXISTS (SELECT 1 FROM "giving_settings");
  INSERT INTO "giving_settings_message_tiers" ("_order", "_parent_id", "id", "yearly", "count") SELECT "_order", 1, "id", "yearly", "count" FROM "support_page_message_tiers" WHERE EXISTS (SELECT 1 FROM "giving_settings");
  INSERT INTO "giving_settings_monthly_amounts" ("_order", "_parent_id", "id", "amount") SELECT "_order", 1, "id", "amount" FROM "support_page_give_card_monthly_amounts" WHERE EXISTS (SELECT 1 FROM "giving_settings");
  INSERT INTO "giving_settings_once_amounts" ("_order", "_parent_id", "id", "amount") SELECT "_order", 1, "id", "amount" FROM "support_page_give_card_once_amounts" WHERE EXISTS (SELECT 1 FROM "giving_settings");
  INSERT INTO "giving_settings_gift_details" ("_order", "_parent_id", "id", "label", "value") SELECT "_order", 1, "id", "label", "value" FROM "support_page_ways_details_rows" WHERE EXISTS (SELECT 1 FROM "giving_settings");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "giving_settings_levels_benefits" CASCADE;
  DROP TABLE "giving_settings_levels_gift_benefits" CASCADE;
  DROP TABLE "giving_settings_levels" CASCADE;
  DROP TABLE "giving_settings_message_tiers" CASCADE;
  DROP TABLE "giving_settings_monthly_amounts" CASCADE;
  DROP TABLE "giving_settings_once_amounts" CASCADE;
  DROP TABLE "giving_settings_gift_details" CASCADE;
  DROP TABLE "giving_settings" CASCADE;
  DROP TYPE "public"."enum_giving_settings_levels_emphasis";`)
}
