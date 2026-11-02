import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_support_page_levels_emphasis" AS ENUM('standard', 'featured', 'leadership');
  CREATE TABLE "support_page_figures" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"value" varchar NOT NULL,
  	"label" varchar NOT NULL
  );
  
  CREATE TABLE "support_page_levels" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"amount" varchar,
  	"description" varchar NOT NULL,
  	"cta_label" varchar,
  	"cta_url" varchar,
  	"emphasis" "enum_support_page_levels_emphasis" DEFAULT 'standard'
  );
  
  CREATE TABLE "support_page_commitments" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "support_page" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"eyebrow" varchar DEFAULT 'Support WUWF',
  	"heading" varchar,
  	"levels_eyebrow" varchar DEFAULT 'For listeners and readers',
  	"levels_heading" varchar DEFAULT 'One spectrum of support',
  	"other_ways" varchar,
  	"show_businesses" boolean DEFAULT true,
  	"businesses_eyebrow" varchar DEFAULT 'For businesses and organizations',
  	"businesses_heading" varchar DEFAULT 'Sponsor WUWF',
  	"businesses_body" varchar,
  	"businesses_primary_label" varchar,
  	"businesses_primary_url" varchar,
  	"businesses_secondary_label" varchar,
  	"businesses_secondary_url" varchar,
  	"show_fellowships" boolean DEFAULT true,
  	"fellowships_eyebrow" varchar DEFAULT 'Philanthropy',
  	"fellowships_heading" varchar DEFAULT 'Fund a reporting fellowship or series',
  	"fellowships_body" varchar,
  	"fellowships_link_label" varchar,
  	"fellowships_link_url" varchar,
  	"gift_notice" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "support_page_figures" ADD CONSTRAINT "support_page_figures_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_levels" ADD CONSTRAINT "support_page_levels_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "support_page_commitments" ADD CONSTRAINT "support_page_commitments_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."support_page"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "support_page_figures_order_idx" ON "support_page_figures" USING btree ("_order");
  CREATE INDEX "support_page_figures_parent_id_idx" ON "support_page_figures" USING btree ("_parent_id");
  CREATE INDEX "support_page_levels_order_idx" ON "support_page_levels" USING btree ("_order");
  CREATE INDEX "support_page_levels_parent_id_idx" ON "support_page_levels" USING btree ("_parent_id");
  CREATE INDEX "support_page_commitments_order_idx" ON "support_page_commitments" USING btree ("_order");
  CREATE INDEX "support_page_commitments_parent_id_idx" ON "support_page_commitments" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "support_page_figures" CASCADE;
  DROP TABLE "support_page_levels" CASCADE;
  DROP TABLE "support_page_commitments" CASCADE;
  DROP TABLE "support_page" CASCADE;
  DROP TYPE "public"."enum_support_page_levels_emphasis";`)
}
