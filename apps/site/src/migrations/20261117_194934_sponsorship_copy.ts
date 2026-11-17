import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { SPONSORSHIP_STARTER } from '../lib/sponsorship/starter'

/**
 * The Sponsorship global becomes the home of every word, price and figure on /sponsor (the page copy used to be code). This creates
 * its tables, then writes the reviewed boards' wording into the global once, through the Local API so every array row gets its
 * own id. Events and programs are left alone (the earlier migration seeded them, and an editor may have changed them). The
 * `down` drops the tables with the rest of the global's data.
 */

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sponsorship_hub_places_items_page" AS ENUM('onAir', 'digital', 'events');
  CREATE TYPE "public"."enum_sponsorship_on_air_buy_items_anchor" AS ENUM('rates', 'carpool', 'programs', 'packages');
  CREATE TABLE "sponsorship_interests" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_budgets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_hub_hero_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_hub_not_an_ad_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "sponsorship_hub_goals_items_lines" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"channel" varchar,
  	"what" varchar,
  	"detail" varchar,
  	"price" varchar
  );
  
  CREATE TABLE "sponsorship_hub_goals_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"title" varchar,
  	"lead" varchar,
  	"total" varchar,
  	"span" varchar
  );
  
  CREATE TABLE "sponsorship_hub_places_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"body" varchar,
  	"detail" varchar,
  	"price" varchar,
  	"page" "enum_sponsorship_hub_places_items_page" DEFAULT 'onAir' NOT NULL
  );
  
  CREATE TABLE "sponsorship_hub_why_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL,
  	"compare" varchar
  );
  
  CREATE TABLE "sponsorship_hub_who_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_hub_testimonials_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"quote" varchar,
  	"name" varchar,
  	"role" varchar
  );
  
  CREATE TABLE "sponsorship_hub_faq_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"question" varchar,
  	"answer" varchar,
  	"link_label" varchar,
  	"link_href" varchar
  );
  
  CREATE TABLE "sponsorship_on_air_buy_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar,
  	"text" varchar,
  	"price" varchar,
  	"anchor" "enum_sponsorship_on_air_buy_items_anchor" DEFAULT 'rates' NOT NULL
  );
  
  CREATE TABLE "sponsorship_on_air_rates_dayparts" (
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
  
  CREATE TABLE "sponsorship_on_air_rates_credit_counts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"count" numeric NOT NULL
  );
  
  CREATE TABLE "sponsorship_on_air_programs_names" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_on_air_packages_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"price" numeric NOT NULL,
  	"value" numeric NOT NULL
  );
  
  CREATE TABLE "sponsorship_on_air_pay_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "sponsorship_digital_website_placements" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"detail" varchar,
  	"size" varchar,
  	"price" varchar
  );
  
  CREATE TABLE "sponsorship_digital_app_placements" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"detail" varchar,
  	"size" varchar,
  	"price" varchar
  );
  
  CREATE TABLE "sponsorship_digital_newsletter_placements" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"detail" varchar,
  	"size" varchar,
  	"price" varchar
  );
  
  CREATE TABLE "sponsorship_digital_rules_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "sponsorship_events_show_up_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_events_every_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar
  );
  
  CREATE TABLE "sponsorship_audience_wuwf_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_small_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_small_skeptical" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_halo_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_halo_comparison" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"npr" numeric,
  	"commercial" numeric
  );
  
  CREATE TABLE "sponsorship_audience_national_stats" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_national_glance" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_sectors_items_local" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_sectors_items_national" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "sponsorship_audience_sectors_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"short" varchar,
  	"title" varchar,
  	"lead" varchar
  );
  
  CREATE TABLE "sponsorship_guidelines_includes_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar
  );
  
  CREATE TABLE "sponsorship_guidelines_leaves_out_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"examples" varchar
  );
  
  CREATE TABLE "sponsorship_guidelines_side_pairs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"ad" varchar,
  	"credit" varchar
  );
  
  CREATE TABLE "sponsorship_guidelines_rules_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"text" varchar
  );
  
  ALTER TABLE "sponsorship" ADD COLUMN "phone" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "address" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "service_line" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "inquiry_email" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "example_name" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "example_line" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "example_website" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_hub" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_on_air" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_digital" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_events" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_audience" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "nav_guidelines" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_link_href" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_primary_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_secondary_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_hero_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_not_an_ad_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_not_an_ad_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_not_an_ad_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_not_an_ad_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_not_an_ad_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_not_an_ad_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_looks_like_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_cta_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_events_goal_name" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_events_goal_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_events_goal_lead" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_events_goal_total" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_events_goal_span" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_goals_events_goal_line_price" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_note_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_note_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_places_note_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_why_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_why_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_why_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_why_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_why_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_why_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_who_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_who_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_who_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_who_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_who_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_who_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_testimonials_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_testimonials_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_testimonials_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_testimonials_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_faq_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_faq_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_faq_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_faq_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_contact_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_submit_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_sending_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_guidelines_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_guidelines_link" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_name" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_organization" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_email" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_phone" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_interests" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_budget" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_message" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_labels_required" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_thanks_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_not_set_up_message" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_failed_message" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "hub_inquiry_thanks_prefix" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_link_href" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_quote" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_quote_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_hero_quote_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_includes_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_includes_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_leaves_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_leaves_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_credit_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_buy_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_buy_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_buy_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_buy_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_prepay_percent" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_nonprofit_percent" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_estimator_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_estimator_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_estimator_disclaimer" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_estimator_cta" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_commitment_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_rates_credits_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_sharing_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_sharing_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_words" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_six_months" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_one_year" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_per_day_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_slots_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_carpool_cta_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_programs_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_programs_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_programs_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_programs_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_programs_choose_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_open_drive_rate" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_new_drive_rate" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_package_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_packages_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_pay_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_pay_cta_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_pay_cta_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "on_air_pay_cta_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_hero_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_hero_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_hero_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_hero_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_hero_link_href" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_website_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_website_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_website_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_website_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_app_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_app_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_app_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_app_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_app_illustration_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_newsletter_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_newsletter_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_newsletter_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_newsletter_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_package_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_package_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_package_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_package_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_package_price" numeric;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_package_price_suffix" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_rules_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_rules_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_rules_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_rules_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_closing_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_closing_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "digital_closing_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_hero_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_hero_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_hero_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_hero_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_hero_link_href" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_show_up_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "events_show_up_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_show_up_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_show_up_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_title_one" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_title_two" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_title_many" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_empty_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_talk_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_more_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_levels_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_open_recognition_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_every_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "events_every_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_every_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_every_note" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_closing_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_closing_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "events_closing_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_hero_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_hero_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_hero_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_hero_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_hero_link_href" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_wuwf_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_wuwf_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_wuwf_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_wuwf_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_wuwf_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_small_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_small_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_small_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_small_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_small_skeptical_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_small_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_compare_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_npr_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_commercial_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_caveat" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_halo_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_glance_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_national_glance_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_local_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_national_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_talk_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_sectors_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_closing_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_closing_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "audience_closing_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_hero_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_hero_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_hero_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_hero_link_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_hero_link_href" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_includes_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_includes_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_includes_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_leaves_out_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_leaves_out_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_leaves_out_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_side_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_side_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_side_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_side_body" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_side_ad_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_side_credit_label" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_rules_show" boolean DEFAULT true;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_rules_eyebrow" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_rules_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_rules_source" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_closing_title" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_closing_text" varchar;
  ALTER TABLE "sponsorship" ADD COLUMN "guidelines_closing_label" varchar;
  ALTER TABLE "sponsorship_interests" ADD CONSTRAINT "sponsorship_interests_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_budgets" ADD CONSTRAINT "sponsorship_budgets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_hero_stats" ADD CONSTRAINT "sponsorship_hub_hero_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_not_an_ad_items" ADD CONSTRAINT "sponsorship_hub_not_an_ad_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_goals_items_lines" ADD CONSTRAINT "sponsorship_hub_goals_items_lines_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_hub_goals_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_goals_items" ADD CONSTRAINT "sponsorship_hub_goals_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_places_items" ADD CONSTRAINT "sponsorship_hub_places_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_why_stats" ADD CONSTRAINT "sponsorship_hub_why_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_who_stats" ADD CONSTRAINT "sponsorship_hub_who_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_testimonials_items" ADD CONSTRAINT "sponsorship_hub_testimonials_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_hub_faq_items" ADD CONSTRAINT "sponsorship_hub_faq_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_on_air_buy_items" ADD CONSTRAINT "sponsorship_on_air_buy_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_on_air_rates_dayparts" ADD CONSTRAINT "sponsorship_on_air_rates_dayparts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_on_air_rates_credit_counts" ADD CONSTRAINT "sponsorship_on_air_rates_credit_counts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_on_air_programs_names" ADD CONSTRAINT "sponsorship_on_air_programs_names_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_on_air_packages_items" ADD CONSTRAINT "sponsorship_on_air_packages_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_on_air_pay_items" ADD CONSTRAINT "sponsorship_on_air_pay_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_digital_website_placements" ADD CONSTRAINT "sponsorship_digital_website_placements_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_digital_app_placements" ADD CONSTRAINT "sponsorship_digital_app_placements_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_digital_newsletter_placements" ADD CONSTRAINT "sponsorship_digital_newsletter_placements_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_digital_rules_items" ADD CONSTRAINT "sponsorship_digital_rules_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_events_show_up_stats" ADD CONSTRAINT "sponsorship_events_show_up_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_events_every_items" ADD CONSTRAINT "sponsorship_events_every_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_wuwf_stats" ADD CONSTRAINT "sponsorship_audience_wuwf_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_small_stats" ADD CONSTRAINT "sponsorship_audience_small_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_small_skeptical" ADD CONSTRAINT "sponsorship_audience_small_skeptical_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_halo_stats" ADD CONSTRAINT "sponsorship_audience_halo_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_halo_comparison" ADD CONSTRAINT "sponsorship_audience_halo_comparison_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_national_stats" ADD CONSTRAINT "sponsorship_audience_national_stats_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_national_glance" ADD CONSTRAINT "sponsorship_audience_national_glance_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_sectors_items_local" ADD CONSTRAINT "sponsorship_audience_sectors_items_local_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_audience_sectors_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_sectors_items_national" ADD CONSTRAINT "sponsorship_audience_sectors_items_national_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship_audience_sectors_items"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_audience_sectors_items" ADD CONSTRAINT "sponsorship_audience_sectors_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_guidelines_includes_items" ADD CONSTRAINT "sponsorship_guidelines_includes_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_guidelines_leaves_out_items" ADD CONSTRAINT "sponsorship_guidelines_leaves_out_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_guidelines_side_pairs" ADD CONSTRAINT "sponsorship_guidelines_side_pairs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "sponsorship_guidelines_rules_items" ADD CONSTRAINT "sponsorship_guidelines_rules_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."sponsorship"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "sponsorship_interests_order_idx" ON "sponsorship_interests" USING btree ("_order");
  CREATE INDEX "sponsorship_interests_parent_id_idx" ON "sponsorship_interests" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_budgets_order_idx" ON "sponsorship_budgets" USING btree ("_order");
  CREATE INDEX "sponsorship_budgets_parent_id_idx" ON "sponsorship_budgets" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_hero_stats_order_idx" ON "sponsorship_hub_hero_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_hero_stats_parent_id_idx" ON "sponsorship_hub_hero_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_not_an_ad_items_order_idx" ON "sponsorship_hub_not_an_ad_items" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_not_an_ad_items_parent_id_idx" ON "sponsorship_hub_not_an_ad_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_goals_items_lines_order_idx" ON "sponsorship_hub_goals_items_lines" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_goals_items_lines_parent_id_idx" ON "sponsorship_hub_goals_items_lines" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_goals_items_order_idx" ON "sponsorship_hub_goals_items" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_goals_items_parent_id_idx" ON "sponsorship_hub_goals_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_places_items_order_idx" ON "sponsorship_hub_places_items" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_places_items_parent_id_idx" ON "sponsorship_hub_places_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_why_stats_order_idx" ON "sponsorship_hub_why_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_why_stats_parent_id_idx" ON "sponsorship_hub_why_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_who_stats_order_idx" ON "sponsorship_hub_who_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_who_stats_parent_id_idx" ON "sponsorship_hub_who_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_testimonials_items_order_idx" ON "sponsorship_hub_testimonials_items" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_testimonials_items_parent_id_idx" ON "sponsorship_hub_testimonials_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_hub_faq_items_order_idx" ON "sponsorship_hub_faq_items" USING btree ("_order");
  CREATE INDEX "sponsorship_hub_faq_items_parent_id_idx" ON "sponsorship_hub_faq_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_on_air_buy_items_order_idx" ON "sponsorship_on_air_buy_items" USING btree ("_order");
  CREATE INDEX "sponsorship_on_air_buy_items_parent_id_idx" ON "sponsorship_on_air_buy_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_on_air_rates_dayparts_order_idx" ON "sponsorship_on_air_rates_dayparts" USING btree ("_order");
  CREATE INDEX "sponsorship_on_air_rates_dayparts_parent_id_idx" ON "sponsorship_on_air_rates_dayparts" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_on_air_rates_credit_counts_order_idx" ON "sponsorship_on_air_rates_credit_counts" USING btree ("_order");
  CREATE INDEX "sponsorship_on_air_rates_credit_counts_parent_id_idx" ON "sponsorship_on_air_rates_credit_counts" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_on_air_programs_names_order_idx" ON "sponsorship_on_air_programs_names" USING btree ("_order");
  CREATE INDEX "sponsorship_on_air_programs_names_parent_id_idx" ON "sponsorship_on_air_programs_names" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_on_air_packages_items_order_idx" ON "sponsorship_on_air_packages_items" USING btree ("_order");
  CREATE INDEX "sponsorship_on_air_packages_items_parent_id_idx" ON "sponsorship_on_air_packages_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_on_air_pay_items_order_idx" ON "sponsorship_on_air_pay_items" USING btree ("_order");
  CREATE INDEX "sponsorship_on_air_pay_items_parent_id_idx" ON "sponsorship_on_air_pay_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_digital_website_placements_order_idx" ON "sponsorship_digital_website_placements" USING btree ("_order");
  CREATE INDEX "sponsorship_digital_website_placements_parent_id_idx" ON "sponsorship_digital_website_placements" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_digital_app_placements_order_idx" ON "sponsorship_digital_app_placements" USING btree ("_order");
  CREATE INDEX "sponsorship_digital_app_placements_parent_id_idx" ON "sponsorship_digital_app_placements" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_digital_newsletter_placements_order_idx" ON "sponsorship_digital_newsletter_placements" USING btree ("_order");
  CREATE INDEX "sponsorship_digital_newsletter_placements_parent_id_idx" ON "sponsorship_digital_newsletter_placements" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_digital_rules_items_order_idx" ON "sponsorship_digital_rules_items" USING btree ("_order");
  CREATE INDEX "sponsorship_digital_rules_items_parent_id_idx" ON "sponsorship_digital_rules_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_events_show_up_stats_order_idx" ON "sponsorship_events_show_up_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_events_show_up_stats_parent_id_idx" ON "sponsorship_events_show_up_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_events_every_items_order_idx" ON "sponsorship_events_every_items" USING btree ("_order");
  CREATE INDEX "sponsorship_events_every_items_parent_id_idx" ON "sponsorship_events_every_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_wuwf_stats_order_idx" ON "sponsorship_audience_wuwf_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_wuwf_stats_parent_id_idx" ON "sponsorship_audience_wuwf_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_small_stats_order_idx" ON "sponsorship_audience_small_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_small_stats_parent_id_idx" ON "sponsorship_audience_small_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_small_skeptical_order_idx" ON "sponsorship_audience_small_skeptical" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_small_skeptical_parent_id_idx" ON "sponsorship_audience_small_skeptical" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_halo_stats_order_idx" ON "sponsorship_audience_halo_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_halo_stats_parent_id_idx" ON "sponsorship_audience_halo_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_halo_comparison_order_idx" ON "sponsorship_audience_halo_comparison" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_halo_comparison_parent_id_idx" ON "sponsorship_audience_halo_comparison" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_national_stats_order_idx" ON "sponsorship_audience_national_stats" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_national_stats_parent_id_idx" ON "sponsorship_audience_national_stats" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_national_glance_order_idx" ON "sponsorship_audience_national_glance" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_national_glance_parent_id_idx" ON "sponsorship_audience_national_glance" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_sectors_items_local_order_idx" ON "sponsorship_audience_sectors_items_local" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_sectors_items_local_parent_id_idx" ON "sponsorship_audience_sectors_items_local" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_sectors_items_national_order_idx" ON "sponsorship_audience_sectors_items_national" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_sectors_items_national_parent_id_idx" ON "sponsorship_audience_sectors_items_national" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_audience_sectors_items_order_idx" ON "sponsorship_audience_sectors_items" USING btree ("_order");
  CREATE INDEX "sponsorship_audience_sectors_items_parent_id_idx" ON "sponsorship_audience_sectors_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_guidelines_includes_items_order_idx" ON "sponsorship_guidelines_includes_items" USING btree ("_order");
  CREATE INDEX "sponsorship_guidelines_includes_items_parent_id_idx" ON "sponsorship_guidelines_includes_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_guidelines_leaves_out_items_order_idx" ON "sponsorship_guidelines_leaves_out_items" USING btree ("_order");
  CREATE INDEX "sponsorship_guidelines_leaves_out_items_parent_id_idx" ON "sponsorship_guidelines_leaves_out_items" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_guidelines_side_pairs_order_idx" ON "sponsorship_guidelines_side_pairs" USING btree ("_order");
  CREATE INDEX "sponsorship_guidelines_side_pairs_parent_id_idx" ON "sponsorship_guidelines_side_pairs" USING btree ("_parent_id");
  CREATE INDEX "sponsorship_guidelines_rules_items_order_idx" ON "sponsorship_guidelines_rules_items" USING btree ("_order");
  CREATE INDEX "sponsorship_guidelines_rules_items_parent_id_idx" ON "sponsorship_guidelines_rules_items" USING btree ("_parent_id");`)

  const { programs: _programs, ...copy } = SPONSORSHIP_STARTER as Record<string, unknown>
  await payload.updateGlobal({ slug: 'sponsorship', data: copy as never, req, overrideAccess: true, context: { disableRevalidate: true } })
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "sponsorship_interests" CASCADE;
  DROP TABLE "sponsorship_budgets" CASCADE;
  DROP TABLE "sponsorship_hub_hero_stats" CASCADE;
  DROP TABLE "sponsorship_hub_not_an_ad_items" CASCADE;
  DROP TABLE "sponsorship_hub_goals_items_lines" CASCADE;
  DROP TABLE "sponsorship_hub_goals_items" CASCADE;
  DROP TABLE "sponsorship_hub_places_items" CASCADE;
  DROP TABLE "sponsorship_hub_why_stats" CASCADE;
  DROP TABLE "sponsorship_hub_who_stats" CASCADE;
  DROP TABLE "sponsorship_hub_testimonials_items" CASCADE;
  DROP TABLE "sponsorship_hub_faq_items" CASCADE;
  DROP TABLE "sponsorship_on_air_buy_items" CASCADE;
  DROP TABLE "sponsorship_on_air_rates_dayparts" CASCADE;
  DROP TABLE "sponsorship_on_air_rates_credit_counts" CASCADE;
  DROP TABLE "sponsorship_on_air_programs_names" CASCADE;
  DROP TABLE "sponsorship_on_air_packages_items" CASCADE;
  DROP TABLE "sponsorship_on_air_pay_items" CASCADE;
  DROP TABLE "sponsorship_digital_website_placements" CASCADE;
  DROP TABLE "sponsorship_digital_app_placements" CASCADE;
  DROP TABLE "sponsorship_digital_newsletter_placements" CASCADE;
  DROP TABLE "sponsorship_digital_rules_items" CASCADE;
  DROP TABLE "sponsorship_events_show_up_stats" CASCADE;
  DROP TABLE "sponsorship_events_every_items" CASCADE;
  DROP TABLE "sponsorship_audience_wuwf_stats" CASCADE;
  DROP TABLE "sponsorship_audience_small_stats" CASCADE;
  DROP TABLE "sponsorship_audience_small_skeptical" CASCADE;
  DROP TABLE "sponsorship_audience_halo_stats" CASCADE;
  DROP TABLE "sponsorship_audience_halo_comparison" CASCADE;
  DROP TABLE "sponsorship_audience_national_stats" CASCADE;
  DROP TABLE "sponsorship_audience_national_glance" CASCADE;
  DROP TABLE "sponsorship_audience_sectors_items_local" CASCADE;
  DROP TABLE "sponsorship_audience_sectors_items_national" CASCADE;
  DROP TABLE "sponsorship_audience_sectors_items" CASCADE;
  DROP TABLE "sponsorship_guidelines_includes_items" CASCADE;
  DROP TABLE "sponsorship_guidelines_leaves_out_items" CASCADE;
  DROP TABLE "sponsorship_guidelines_side_pairs" CASCADE;
  DROP TABLE "sponsorship_guidelines_rules_items" CASCADE;
  ALTER TABLE "sponsorship" DROP COLUMN "phone";
  ALTER TABLE "sponsorship" DROP COLUMN "address";
  ALTER TABLE "sponsorship" DROP COLUMN "service_line";
  ALTER TABLE "sponsorship" DROP COLUMN "inquiry_email";
  ALTER TABLE "sponsorship" DROP COLUMN "example_name";
  ALTER TABLE "sponsorship" DROP COLUMN "example_line";
  ALTER TABLE "sponsorship" DROP COLUMN "example_website";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_title";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_hub";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_on_air";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_digital";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_events";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_audience";
  ALTER TABLE "sponsorship" DROP COLUMN "nav_guidelines";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_link_href";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_primary_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_secondary_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_hero_source";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_not_an_ad_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_not_an_ad_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_not_an_ad_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_not_an_ad_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_not_an_ad_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_not_an_ad_source";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_looks_like_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_cta_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_events_goal_name";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_events_goal_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_events_goal_lead";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_events_goal_total";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_events_goal_span";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_goals_events_goal_line_price";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_note_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_note_text";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_places_note_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_why_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_why_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_why_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_why_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_why_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_why_source";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_who_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_who_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_who_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_who_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_who_source";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_who_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_testimonials_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_testimonials_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_testimonials_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_testimonials_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_faq_show";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_faq_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_faq_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_faq_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_body";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_contact_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_submit_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_sending_label";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_guidelines_note";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_guidelines_link";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_name";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_organization";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_email";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_phone";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_interests";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_budget";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_message";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_labels_required";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_thanks_title";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_not_set_up_message";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_failed_message";
  ALTER TABLE "sponsorship" DROP COLUMN "hub_inquiry_thanks_prefix";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_link_href";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_quote";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_quote_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_hero_quote_note";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_includes_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_includes_text";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_leaves_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_leaves_text";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_credit_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_buy_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_buy_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_buy_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_buy_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_prepay_percent";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_nonprofit_percent";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_note";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_estimator_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_estimator_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_estimator_disclaimer";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_estimator_cta";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_commitment_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_rates_credits_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_sharing_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_sharing_text";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_words";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_six_months";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_one_year";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_per_day_note";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_slots_note";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_carpool_cta_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_programs_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_programs_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_programs_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_programs_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_programs_choose_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_body";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_open_drive_rate";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_new_drive_rate";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_package_label";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_packages_note";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_pay_show";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_pay_cta_title";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_pay_cta_text";
  ALTER TABLE "sponsorship" DROP COLUMN "on_air_pay_cta_label";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_hero_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_hero_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_hero_body";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_hero_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_hero_link_href";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_website_show";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_website_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_website_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_website_body";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_app_show";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_app_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_app_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_app_body";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_app_illustration_note";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_newsletter_show";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_newsletter_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_newsletter_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_newsletter_body";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_package_show";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_package_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_package_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_package_body";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_package_price";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_package_price_suffix";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_rules_show";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_rules_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_rules_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_rules_body";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_closing_title";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_closing_text";
  ALTER TABLE "sponsorship" DROP COLUMN "digital_closing_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_hero_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "events_hero_title";
  ALTER TABLE "sponsorship" DROP COLUMN "events_hero_body";
  ALTER TABLE "sponsorship" DROP COLUMN "events_hero_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_hero_link_href";
  ALTER TABLE "sponsorship" DROP COLUMN "events_show_up_show";
  ALTER TABLE "sponsorship" DROP COLUMN "events_show_up_title";
  ALTER TABLE "sponsorship" DROP COLUMN "events_show_up_source";
  ALTER TABLE "sponsorship" DROP COLUMN "events_show_up_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_title_one";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_title_two";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_title_many";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_empty_text";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_talk_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_more_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_levels_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_open_recognition_label";
  ALTER TABLE "sponsorship" DROP COLUMN "events_every_show";
  ALTER TABLE "sponsorship" DROP COLUMN "events_every_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "events_every_title";
  ALTER TABLE "sponsorship" DROP COLUMN "events_every_note";
  ALTER TABLE "sponsorship" DROP COLUMN "events_closing_title";
  ALTER TABLE "sponsorship" DROP COLUMN "events_closing_text";
  ALTER TABLE "sponsorship" DROP COLUMN "events_closing_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_hero_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_hero_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_hero_body";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_hero_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_hero_link_href";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_wuwf_show";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_wuwf_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_wuwf_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_wuwf_body";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_wuwf_source";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_small_show";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_small_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_small_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_small_body";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_small_skeptical_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_small_source";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_show";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_body";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_compare_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_npr_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_commercial_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_caveat";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_halo_source";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_show";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_body";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_source";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_glance_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_national_glance_source";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_show";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_body";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_local_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_national_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_talk_label";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_sectors_source";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_closing_title";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_closing_text";
  ALTER TABLE "sponsorship" DROP COLUMN "audience_closing_label";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_hero_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_hero_title";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_hero_body";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_hero_link_label";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_hero_link_href";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_includes_show";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_includes_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_includes_title";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_leaves_out_show";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_leaves_out_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_leaves_out_title";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_side_show";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_side_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_side_title";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_side_body";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_side_ad_label";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_side_credit_label";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_rules_show";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_rules_eyebrow";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_rules_title";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_rules_source";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_closing_title";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_closing_text";
  ALTER TABLE "sponsorship" DROP COLUMN "guidelines_closing_label";
  DROP TYPE "public"."enum_sponsorship_hub_places_items_page";
  DROP TYPE "public"."enum_sponsorship_on_air_buy_items_anchor";`)
}
