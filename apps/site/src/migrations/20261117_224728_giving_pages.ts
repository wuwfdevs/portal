import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Support page global becomes the Giving pages (boards 14, 14b, 14c, 14d): the Give page's card, levels and sections, Other ways to
 * give, Leave a legacy and the thank-you page, every word of it in the admin. The first-pass page's own fields (hero figures, "other
 * ways" line, businesses, fellowships, footer note) and its levels' button addresses go: the rethought boards replace them, and the
 * boards' wording replaces them (written by the next migration, `giving_form_addresses`, because a migration that uses the Local API reads the
 * *current* schema, so it can only run after every column it touches exists). Levels from the first pass are cleared first because each level
 * now needs a monthly minimum, which an old row cannot have. The `down` restores the old tables and columns empty; the first-pass wording is not kept.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_support_page_ways_groups_key" AS ENUM('vehicles', 'assets', 'work', 'gift', 'will');
  CREATE TYPE "public"."enum_support_page_ways_panels_group" AS ENUM('vehicles', 'assets', 'work', 'gift', 'will');
  CREATE TABLE "support_page_levels_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_levels_gift_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_message_tiers" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"yearly" numeric NOT NULL,
  	"count" numeric NOT NULL
  );
  
  CREATE TABLE "support_page_give_hero_assurances" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_give_card_monthly_amounts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"amount" numeric NOT NULL
  );
  
  CREATE TABLE "support_page_give_card_once_amounts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"amount" numeric NOT NULL
  );
  
  CREATE TABLE "support_page_give_card_any_benefits" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_give_where_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "support_page_give_monthly_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "support_page_give_more_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "support_page_give_after_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "support_page_give_fellowships_commitments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_give_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_ways_groups" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"key" "enum_support_page_ways_groups_key" NOT NULL,
  	"label" varchar NOT NULL,
  	"best" varchar,
  	"effort" varchar
  );
  
  CREATE TABLE "support_page_ways_panels_steps" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_ways_panels_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_ways_panels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"group" "enum_support_page_ways_panels_group" NOT NULL,
  	"slug" varchar NOT NULL,
  	"tab_label" varchar,
  	"eyebrow" varchar,
  	"title" varchar,
  	"lead" varchar,
  	"button_label" varchar,
  	"button_href" varchar,
  	"show_details" boolean DEFAULT false
  );
  
  CREATE TABLE "support_page_ways_details_rows" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL,
  	"value" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_legacy_routes_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"tag" varchar,
  	"title" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "support_page_legacy_steps_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "support_page_legacy_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_thanks_next" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"lead" varchar NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "support_page_thanks_while_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"text" varchar,
  	"href" varchar
  );
  
  ALTER TABLE "support_page_figures" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_commitments" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "support_page_figures" CASCADE;
  DROP TABLE "support_page_commitments" CASCADE;
  ALTER TABLE "support_page_levels" ALTER COLUMN "description" DROP NOT NULL;
  DELETE FROM "support_page_levels";
  ALTER TABLE "support_page_levels" ADD COLUMN "minimum_monthly" numeric NOT NULL;
  ALTER TABLE "support_page" ADD COLUMN "phone" varchar;
  ALTER TABLE "support_page" ADD COLUMN "email" varchar;
  ALTER TABLE "support_page" ADD COLUMN "mailing_address" varchar;
  ALTER TABLE "support_page" ADD COLUMN "service_line" varchar;
  ALTER TABLE "support_page" ADD COLUMN "nav_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "nav_give" varchar;
  ALTER TABLE "support_page" ADD COLUMN "nav_legacy" varchar;
  ALTER TABLE "support_page" ADD COLUMN "nav_ways" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_address" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_prefill" boolean DEFAULT false;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_amount_param" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_frequency_param" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_monthly_value" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_once_value" varchar;
  ALTER TABLE "support_page" ADD COLUMN "donation_form_not_set_up" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_hero_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_hero_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_hero_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_monthly_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_monthly_sub" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_once_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_once_sub" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_monthly_default" numeric;
  ALTER TABLE "support_page" ADD COLUMN "give_card_once_default" numeric;
  ALTER TABLE "support_page" ADD COLUMN "give_card_other_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_title_monthly" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_title_once" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_message_one" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_message_many" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_any_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_cta_monthly" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_cta_once" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_cta_other" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_note_with_prefill" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_card_note_without_prefill" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_where_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_where_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_where_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_where_closing_lead" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_where_closing" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_monthly_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_monthly_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_monthly_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_button_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_footnote" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_footnote_link_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_levels_footnote_link_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_more_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_more_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_more_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_after_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_after_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_after_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_after_link_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_after_link_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_fellowships_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_fellowships_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_fellowships_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_fellowships_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_fellowships_button_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_fellowships_button_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_businesses_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_businesses_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_businesses_text" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_businesses_button_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_businesses_button_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "give_faq_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "give_faq_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_hero_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_hero_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_hero_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_steps_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_notes_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_details_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_details_copy_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_details_copied_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_details_note" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_contact_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_contact_text" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_contact_call_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "ways_contact_email_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_hero_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_hero_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_hero_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_contact_card_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_contact_card_text" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_contact_card_note" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_contact_card_call_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_contact_card_email_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_routes_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "legacy_routes_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_routes_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_sample_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "legacy_sample_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_sample_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_sample_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_sample_quote" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_sample_quote_note" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_steps_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "legacy_steps_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_steps_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_recognition_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "legacy_recognition_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_recognition_text" varchar;
  ALTER TABLE "support_page" ADD COLUMN "legacy_faq_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "legacy_faq_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_title_named" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_body_monthly" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_body_once" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_primary_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_primary_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_secondary_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_secondary_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_next_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_prompt_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_prompt_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_prompt_href" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_while_show" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "thanks_while_eyebrow" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_while_title" varchar;
  ALTER TABLE "support_page" ADD COLUMN "thanks_help_line" varchar;
  ALTER TABLE "support_page_levels_benefits" ADD CONSTRAINT "support_page_levels_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page_levels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_levels_gift_benefits" ADD CONSTRAINT "support_page_levels_gift_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page_levels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_message_tiers" ADD CONSTRAINT "support_page_message_tiers_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_hero_assurances" ADD CONSTRAINT "support_page_give_hero_assurances_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_card_monthly_amounts" ADD CONSTRAINT "support_page_give_card_monthly_amounts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_card_once_amounts" ADD CONSTRAINT "support_page_give_card_once_amounts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_card_any_benefits" ADD CONSTRAINT "support_page_give_card_any_benefits_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_where_items" ADD CONSTRAINT "support_page_give_where_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_monthly_items" ADD CONSTRAINT "support_page_give_monthly_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_more_items" ADD CONSTRAINT "support_page_give_more_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_after_steps" ADD CONSTRAINT "support_page_give_after_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_fellowships_commitments" ADD CONSTRAINT "support_page_give_fellowships_commitments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_give_faq_items" ADD CONSTRAINT "support_page_give_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_ways_groups" ADD CONSTRAINT "support_page_ways_groups_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_ways_panels_steps" ADD CONSTRAINT "support_page_ways_panels_steps_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page_ways_panels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_ways_panels_notes" ADD CONSTRAINT "support_page_ways_panels_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page_ways_panels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_ways_panels" ADD CONSTRAINT "support_page_ways_panels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_ways_details_rows" ADD CONSTRAINT "support_page_ways_details_rows_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_legacy_routes_items" ADD CONSTRAINT "support_page_legacy_routes_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_legacy_steps_items" ADD CONSTRAINT "support_page_legacy_steps_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_legacy_faq_items" ADD CONSTRAINT "support_page_legacy_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_thanks_next" ADD CONSTRAINT "support_page_thanks_next_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_thanks_while_items" ADD CONSTRAINT "support_page_thanks_while_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "support_page_levels_benefits_order_idx" ON "support_page_levels_benefits" USING btree ("_order");
  CREATE INDEX "support_page_levels_benefits_parent_id_idx" ON "support_page_levels_benefits" USING btree ("_parent_id");
  CREATE INDEX "support_page_levels_gift_benefits_order_idx" ON "support_page_levels_gift_benefits" USING btree ("_order");
  CREATE INDEX "support_page_levels_gift_benefits_parent_id_idx" ON "support_page_levels_gift_benefits" USING btree ("_parent_id");
  CREATE INDEX "support_page_message_tiers_order_idx" ON "support_page_message_tiers" USING btree ("_order");
  CREATE INDEX "support_page_message_tiers_parent_id_idx" ON "support_page_message_tiers" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_hero_assurances_order_idx" ON "support_page_give_hero_assurances" USING btree ("_order");
  CREATE INDEX "support_page_give_hero_assurances_parent_id_idx" ON "support_page_give_hero_assurances" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_card_monthly_amounts_order_idx" ON "support_page_give_card_monthly_amounts" USING btree ("_order");
  CREATE INDEX "support_page_give_card_monthly_amounts_parent_id_idx" ON "support_page_give_card_monthly_amounts" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_card_once_amounts_order_idx" ON "support_page_give_card_once_amounts" USING btree ("_order");
  CREATE INDEX "support_page_give_card_once_amounts_parent_id_idx" ON "support_page_give_card_once_amounts" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_card_any_benefits_order_idx" ON "support_page_give_card_any_benefits" USING btree ("_order");
  CREATE INDEX "support_page_give_card_any_benefits_parent_id_idx" ON "support_page_give_card_any_benefits" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_where_items_order_idx" ON "support_page_give_where_items" USING btree ("_order");
  CREATE INDEX "support_page_give_where_items_parent_id_idx" ON "support_page_give_where_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_monthly_items_order_idx" ON "support_page_give_monthly_items" USING btree ("_order");
  CREATE INDEX "support_page_give_monthly_items_parent_id_idx" ON "support_page_give_monthly_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_more_items_order_idx" ON "support_page_give_more_items" USING btree ("_order");
  CREATE INDEX "support_page_give_more_items_parent_id_idx" ON "support_page_give_more_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_after_steps_order_idx" ON "support_page_give_after_steps" USING btree ("_order");
  CREATE INDEX "support_page_give_after_steps_parent_id_idx" ON "support_page_give_after_steps" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_fellowships_commitments_order_idx" ON "support_page_give_fellowships_commitments" USING btree ("_order");
  CREATE INDEX "support_page_give_fellowships_commitments_parent_id_idx" ON "support_page_give_fellowships_commitments" USING btree ("_parent_id");
  CREATE INDEX "support_page_give_faq_items_order_idx" ON "support_page_give_faq_items" USING btree ("_order");
  CREATE INDEX "support_page_give_faq_items_parent_id_idx" ON "support_page_give_faq_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_ways_groups_order_idx" ON "support_page_ways_groups" USING btree ("_order");
  CREATE INDEX "support_page_ways_groups_parent_id_idx" ON "support_page_ways_groups" USING btree ("_parent_id");
  CREATE INDEX "support_page_ways_panels_steps_order_idx" ON "support_page_ways_panels_steps" USING btree ("_order");
  CREATE INDEX "support_page_ways_panels_steps_parent_id_idx" ON "support_page_ways_panels_steps" USING btree ("_parent_id");
  CREATE INDEX "support_page_ways_panels_notes_order_idx" ON "support_page_ways_panels_notes" USING btree ("_order");
  CREATE INDEX "support_page_ways_panels_notes_parent_id_idx" ON "support_page_ways_panels_notes" USING btree ("_parent_id");
  CREATE INDEX "support_page_ways_panels_order_idx" ON "support_page_ways_panels" USING btree ("_order");
  CREATE INDEX "support_page_ways_panels_parent_id_idx" ON "support_page_ways_panels" USING btree ("_parent_id");
  CREATE INDEX "support_page_ways_details_rows_order_idx" ON "support_page_ways_details_rows" USING btree ("_order");
  CREATE INDEX "support_page_ways_details_rows_parent_id_idx" ON "support_page_ways_details_rows" USING btree ("_parent_id");
  CREATE INDEX "support_page_legacy_routes_items_order_idx" ON "support_page_legacy_routes_items" USING btree ("_order");
  CREATE INDEX "support_page_legacy_routes_items_parent_id_idx" ON "support_page_legacy_routes_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_legacy_steps_items_order_idx" ON "support_page_legacy_steps_items" USING btree ("_order");
  CREATE INDEX "support_page_legacy_steps_items_parent_id_idx" ON "support_page_legacy_steps_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_legacy_faq_items_order_idx" ON "support_page_legacy_faq_items" USING btree ("_order");
  CREATE INDEX "support_page_legacy_faq_items_parent_id_idx" ON "support_page_legacy_faq_items" USING btree ("_parent_id");
  CREATE INDEX "support_page_thanks_next_order_idx" ON "support_page_thanks_next" USING btree ("_order");
  CREATE INDEX "support_page_thanks_next_parent_id_idx" ON "support_page_thanks_next" USING btree ("_parent_id");
  CREATE INDEX "support_page_thanks_while_items_order_idx" ON "support_page_thanks_while_items" USING btree ("_order");
  CREATE INDEX "support_page_thanks_while_items_parent_id_idx" ON "support_page_thanks_while_items" USING btree ("_parent_id");
  ALTER TABLE "support_page_levels" DROP COLUMN "cta_label";
  ALTER TABLE "support_page_levels" DROP COLUMN "cta_url";
  ALTER TABLE "support_page" DROP COLUMN "eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "heading";
  ALTER TABLE "support_page" DROP COLUMN "levels_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "levels_heading";
  ALTER TABLE "support_page" DROP COLUMN "other_ways";
  ALTER TABLE "support_page" DROP COLUMN "show_businesses";
  ALTER TABLE "support_page" DROP COLUMN "businesses_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "businesses_heading";
  ALTER TABLE "support_page" DROP COLUMN "businesses_body";
  ALTER TABLE "support_page" DROP COLUMN "businesses_primary_label";
  ALTER TABLE "support_page" DROP COLUMN "businesses_primary_url";
  ALTER TABLE "support_page" DROP COLUMN "businesses_secondary_label";
  ALTER TABLE "support_page" DROP COLUMN "businesses_secondary_url";
  ALTER TABLE "support_page" DROP COLUMN "show_fellowships";
  ALTER TABLE "support_page" DROP COLUMN "fellowships_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "fellowships_heading";
  ALTER TABLE "support_page" DROP COLUMN "fellowships_body";
  ALTER TABLE "support_page" DROP COLUMN "fellowships_link_label";
  ALTER TABLE "support_page" DROP COLUMN "fellowships_link_url";
  ALTER TABLE "support_page" DROP COLUMN "gift_notice";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "support_page_figures" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_commitments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "support_page_levels_benefits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_levels_gift_benefits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_message_tiers" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_hero_assurances" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_card_monthly_amounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_card_once_amounts" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_card_any_benefits" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_where_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_monthly_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_more_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_after_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_fellowships_commitments" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_give_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_ways_groups" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_ways_panels_steps" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_ways_panels_notes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_ways_panels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_ways_details_rows" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_legacy_routes_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_legacy_steps_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_legacy_faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_thanks_next" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "support_page_thanks_while_items" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "support_page_levels_benefits" CASCADE;
  DROP TABLE "support_page_levels_gift_benefits" CASCADE;
  DROP TABLE "support_page_message_tiers" CASCADE;
  DROP TABLE "support_page_give_hero_assurances" CASCADE;
  DROP TABLE "support_page_give_card_monthly_amounts" CASCADE;
  DROP TABLE "support_page_give_card_once_amounts" CASCADE;
  DROP TABLE "support_page_give_card_any_benefits" CASCADE;
  DROP TABLE "support_page_give_where_items" CASCADE;
  DROP TABLE "support_page_give_monthly_items" CASCADE;
  DROP TABLE "support_page_give_more_items" CASCADE;
  DROP TABLE "support_page_give_after_steps" CASCADE;
  DROP TABLE "support_page_give_fellowships_commitments" CASCADE;
  DROP TABLE "support_page_give_faq_items" CASCADE;
  DROP TABLE "support_page_ways_groups" CASCADE;
  DROP TABLE "support_page_ways_panels_steps" CASCADE;
  DROP TABLE "support_page_ways_panels_notes" CASCADE;
  DROP TABLE "support_page_ways_panels" CASCADE;
  DROP TABLE "support_page_ways_details_rows" CASCADE;
  DROP TABLE "support_page_legacy_routes_items" CASCADE;
  DROP TABLE "support_page_legacy_steps_items" CASCADE;
  DROP TABLE "support_page_legacy_faq_items" CASCADE;
  DROP TABLE "support_page_thanks_next" CASCADE;
  DROP TABLE "support_page_thanks_while_items" CASCADE;
  ALTER TABLE "support_page_levels" ALTER COLUMN "description" SET NOT NULL;
  ALTER TABLE "support_page_levels" ADD COLUMN "cta_label" varchar;
  ALTER TABLE "support_page_levels" ADD COLUMN "cta_url" varchar;
  ALTER TABLE "support_page" ADD COLUMN "eyebrow" varchar DEFAULT 'Support WUWF';
  ALTER TABLE "support_page" ADD COLUMN "heading" varchar;
  ALTER TABLE "support_page" ADD COLUMN "levels_eyebrow" varchar DEFAULT 'For listeners and readers';
  ALTER TABLE "support_page" ADD COLUMN "levels_heading" varchar DEFAULT 'One spectrum of support';
  ALTER TABLE "support_page" ADD COLUMN "other_ways" varchar;
  ALTER TABLE "support_page" ADD COLUMN "show_businesses" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "businesses_eyebrow" varchar DEFAULT 'For businesses and organizations';
  ALTER TABLE "support_page" ADD COLUMN "businesses_heading" varchar DEFAULT 'Sponsor WUWF';
  ALTER TABLE "support_page" ADD COLUMN "businesses_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "businesses_primary_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "businesses_primary_url" varchar;
  ALTER TABLE "support_page" ADD COLUMN "businesses_secondary_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "businesses_secondary_url" varchar;
  ALTER TABLE "support_page" ADD COLUMN "show_fellowships" boolean DEFAULT true;
  ALTER TABLE "support_page" ADD COLUMN "fellowships_eyebrow" varchar DEFAULT 'Philanthropy';
  ALTER TABLE "support_page" ADD COLUMN "fellowships_heading" varchar DEFAULT 'Fund a reporting fellowship or series';
  ALTER TABLE "support_page" ADD COLUMN "fellowships_body" varchar;
  ALTER TABLE "support_page" ADD COLUMN "fellowships_link_label" varchar;
  ALTER TABLE "support_page" ADD COLUMN "fellowships_link_url" varchar;
  ALTER TABLE "support_page" ADD COLUMN "gift_notice" varchar;
  ALTER TABLE "support_page_figures" ADD CONSTRAINT "support_page_figures_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_commitments" ADD CONSTRAINT "support_page_commitments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "support_page_figures_order_idx" ON "support_page_figures" USING btree ("_order");
  CREATE INDEX "support_page_figures_parent_id_idx" ON "support_page_figures" USING btree ("_parent_id");
  CREATE INDEX "support_page_commitments_order_idx" ON "support_page_commitments" USING btree ("_order");
  CREATE INDEX "support_page_commitments_parent_id_idx" ON "support_page_commitments" USING btree ("_parent_id");
  ALTER TABLE "support_page_levels" DROP COLUMN "minimum_monthly";
  ALTER TABLE "support_page" DROP COLUMN "phone";
  ALTER TABLE "support_page" DROP COLUMN "email";
  ALTER TABLE "support_page" DROP COLUMN "mailing_address";
  ALTER TABLE "support_page" DROP COLUMN "service_line";
  ALTER TABLE "support_page" DROP COLUMN "nav_title";
  ALTER TABLE "support_page" DROP COLUMN "nav_give";
  ALTER TABLE "support_page" DROP COLUMN "nav_legacy";
  ALTER TABLE "support_page" DROP COLUMN "nav_ways";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_address";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_prefill";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_amount_param";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_frequency_param";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_monthly_value";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_once_value";
  ALTER TABLE "support_page" DROP COLUMN "donation_form_not_set_up";
  ALTER TABLE "support_page" DROP COLUMN "give_hero_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_hero_title";
  ALTER TABLE "support_page" DROP COLUMN "give_hero_body";
  ALTER TABLE "support_page" DROP COLUMN "give_card_monthly_label";
  ALTER TABLE "support_page" DROP COLUMN "give_card_monthly_sub";
  ALTER TABLE "support_page" DROP COLUMN "give_card_once_label";
  ALTER TABLE "support_page" DROP COLUMN "give_card_once_sub";
  ALTER TABLE "support_page" DROP COLUMN "give_card_monthly_default";
  ALTER TABLE "support_page" DROP COLUMN "give_card_once_default";
  ALTER TABLE "support_page" DROP COLUMN "give_card_other_label";
  ALTER TABLE "support_page" DROP COLUMN "give_card_title_monthly";
  ALTER TABLE "support_page" DROP COLUMN "give_card_title_once";
  ALTER TABLE "support_page" DROP COLUMN "give_card_message_one";
  ALTER TABLE "support_page" DROP COLUMN "give_card_message_many";
  ALTER TABLE "support_page" DROP COLUMN "give_card_any_title";
  ALTER TABLE "support_page" DROP COLUMN "give_card_cta_monthly";
  ALTER TABLE "support_page" DROP COLUMN "give_card_cta_once";
  ALTER TABLE "support_page" DROP COLUMN "give_card_cta_other";
  ALTER TABLE "support_page" DROP COLUMN "give_card_note_with_prefill";
  ALTER TABLE "support_page" DROP COLUMN "give_card_note_without_prefill";
  ALTER TABLE "support_page" DROP COLUMN "give_where_show";
  ALTER TABLE "support_page" DROP COLUMN "give_where_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_where_title";
  ALTER TABLE "support_page" DROP COLUMN "give_where_closing_lead";
  ALTER TABLE "support_page" DROP COLUMN "give_where_closing";
  ALTER TABLE "support_page" DROP COLUMN "give_monthly_show";
  ALTER TABLE "support_page" DROP COLUMN "give_monthly_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_monthly_title";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_show";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_title";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_body";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_button_label";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_footnote";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_footnote_link_label";
  ALTER TABLE "support_page" DROP COLUMN "give_levels_footnote_link_href";
  ALTER TABLE "support_page" DROP COLUMN "give_more_show";
  ALTER TABLE "support_page" DROP COLUMN "give_more_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_more_title";
  ALTER TABLE "support_page" DROP COLUMN "give_after_show";
  ALTER TABLE "support_page" DROP COLUMN "give_after_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_after_title";
  ALTER TABLE "support_page" DROP COLUMN "give_after_link_label";
  ALTER TABLE "support_page" DROP COLUMN "give_after_link_href";
  ALTER TABLE "support_page" DROP COLUMN "give_fellowships_show";
  ALTER TABLE "support_page" DROP COLUMN "give_fellowships_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "give_fellowships_title";
  ALTER TABLE "support_page" DROP COLUMN "give_fellowships_body";
  ALTER TABLE "support_page" DROP COLUMN "give_fellowships_button_label";
  ALTER TABLE "support_page" DROP COLUMN "give_fellowships_button_href";
  ALTER TABLE "support_page" DROP COLUMN "give_businesses_show";
  ALTER TABLE "support_page" DROP COLUMN "give_businesses_title";
  ALTER TABLE "support_page" DROP COLUMN "give_businesses_text";
  ALTER TABLE "support_page" DROP COLUMN "give_businesses_button_label";
  ALTER TABLE "support_page" DROP COLUMN "give_businesses_button_href";
  ALTER TABLE "support_page" DROP COLUMN "give_faq_show";
  ALTER TABLE "support_page" DROP COLUMN "give_faq_title";
  ALTER TABLE "support_page" DROP COLUMN "ways_hero_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "ways_hero_title";
  ALTER TABLE "support_page" DROP COLUMN "ways_hero_body";
  ALTER TABLE "support_page" DROP COLUMN "ways_steps_title";
  ALTER TABLE "support_page" DROP COLUMN "ways_notes_title";
  ALTER TABLE "support_page" DROP COLUMN "ways_details_title";
  ALTER TABLE "support_page" DROP COLUMN "ways_details_copy_label";
  ALTER TABLE "support_page" DROP COLUMN "ways_details_copied_label";
  ALTER TABLE "support_page" DROP COLUMN "ways_details_note";
  ALTER TABLE "support_page" DROP COLUMN "ways_contact_title";
  ALTER TABLE "support_page" DROP COLUMN "ways_contact_text";
  ALTER TABLE "support_page" DROP COLUMN "ways_contact_call_label";
  ALTER TABLE "support_page" DROP COLUMN "ways_contact_email_label";
  ALTER TABLE "support_page" DROP COLUMN "legacy_hero_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "legacy_hero_title";
  ALTER TABLE "support_page" DROP COLUMN "legacy_hero_body";
  ALTER TABLE "support_page" DROP COLUMN "legacy_contact_card_title";
  ALTER TABLE "support_page" DROP COLUMN "legacy_contact_card_text";
  ALTER TABLE "support_page" DROP COLUMN "legacy_contact_card_note";
  ALTER TABLE "support_page" DROP COLUMN "legacy_contact_card_call_label";
  ALTER TABLE "support_page" DROP COLUMN "legacy_contact_card_email_label";
  ALTER TABLE "support_page" DROP COLUMN "legacy_routes_show";
  ALTER TABLE "support_page" DROP COLUMN "legacy_routes_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "legacy_routes_title";
  ALTER TABLE "support_page" DROP COLUMN "legacy_sample_show";
  ALTER TABLE "support_page" DROP COLUMN "legacy_sample_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "legacy_sample_title";
  ALTER TABLE "support_page" DROP COLUMN "legacy_sample_body";
  ALTER TABLE "support_page" DROP COLUMN "legacy_sample_quote";
  ALTER TABLE "support_page" DROP COLUMN "legacy_sample_quote_note";
  ALTER TABLE "support_page" DROP COLUMN "legacy_steps_show";
  ALTER TABLE "support_page" DROP COLUMN "legacy_steps_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "legacy_steps_title";
  ALTER TABLE "support_page" DROP COLUMN "legacy_recognition_show";
  ALTER TABLE "support_page" DROP COLUMN "legacy_recognition_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "legacy_recognition_text";
  ALTER TABLE "support_page" DROP COLUMN "legacy_faq_show";
  ALTER TABLE "support_page" DROP COLUMN "legacy_faq_title";
  ALTER TABLE "support_page" DROP COLUMN "thanks_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "thanks_title";
  ALTER TABLE "support_page" DROP COLUMN "thanks_title_named";
  ALTER TABLE "support_page" DROP COLUMN "thanks_body";
  ALTER TABLE "support_page" DROP COLUMN "thanks_body_monthly";
  ALTER TABLE "support_page" DROP COLUMN "thanks_body_once";
  ALTER TABLE "support_page" DROP COLUMN "thanks_primary_label";
  ALTER TABLE "support_page" DROP COLUMN "thanks_primary_href";
  ALTER TABLE "support_page" DROP COLUMN "thanks_secondary_label";
  ALTER TABLE "support_page" DROP COLUMN "thanks_secondary_href";
  ALTER TABLE "support_page" DROP COLUMN "thanks_next_title";
  ALTER TABLE "support_page" DROP COLUMN "thanks_prompt_title";
  ALTER TABLE "support_page" DROP COLUMN "thanks_prompt_label";
  ALTER TABLE "support_page" DROP COLUMN "thanks_prompt_href";
  ALTER TABLE "support_page" DROP COLUMN "thanks_while_show";
  ALTER TABLE "support_page" DROP COLUMN "thanks_while_eyebrow";
  ALTER TABLE "support_page" DROP COLUMN "thanks_while_title";
  ALTER TABLE "support_page" DROP COLUMN "thanks_help_line";
  DROP TYPE "public"."enum_support_page_ways_groups_key";
  DROP TYPE "public"."enum_support_page_ways_panels_group";`)
}
