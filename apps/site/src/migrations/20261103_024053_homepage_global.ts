import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "homepage" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"emergency_active" boolean DEFAULT false,
  	"emergency_label" varchar DEFAULT 'Emergency coverage',
  	"emergency_headline" varchar,
  	"emergency_body" varchar,
  	"emergency_link_label" varchar,
  	"emergency_link_href" varchar,
  	"lead_id" integer,
  	"lead_kicker" varchar,
  	"fellowship_feature_enabled" boolean DEFAULT false,
  	"fellowship_feature_fellowship_id" integer,
  	"fellowship_feature_story_id" integer,
  	"local_news_heading" varchar DEFAULT 'Northwest Florida',
  	"local_news_section_id" integer,
  	"local_news_count" numeric DEFAULT 6,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "homepage_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"posts_id" integer
  );
  
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_lead_id_posts_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_fellowship_feature_fellowship_id_fellowships_id_fk" FOREIGN KEY ("fellowship_feature_fellowship_id") REFERENCES "public"."fellowships"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_fellowship_feature_story_id_posts_id_fk" FOREIGN KEY ("fellowship_feature_story_id") REFERENCES "public"."posts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage" ADD CONSTRAINT "homepage_local_news_section_id_sections_id_fk" FOREIGN KEY ("local_news_section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."homepage"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "homepage_rels" ADD CONSTRAINT "homepage_rels_posts_fk" FOREIGN KEY ("posts_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "homepage_lead_idx" ON "homepage" USING btree ("lead_id");
  CREATE INDEX "homepage_fellowship_feature_fellowship_feature_fellowshi_idx" ON "homepage" USING btree ("fellowship_feature_fellowship_id");
  CREATE INDEX "homepage_fellowship_feature_fellowship_feature_story_idx" ON "homepage" USING btree ("fellowship_feature_story_id");
  CREATE INDEX "homepage_local_news_local_news_section_idx" ON "homepage" USING btree ("local_news_section_id");
  CREATE INDEX "homepage_rels_order_idx" ON "homepage_rels" USING btree ("order");
  CREATE INDEX "homepage_rels_parent_idx" ON "homepage_rels" USING btree ("parent_id");
  CREATE INDEX "homepage_rels_path_idx" ON "homepage_rels" USING btree ("path");
  CREATE INDEX "homepage_rels_posts_id_idx" ON "homepage_rels" USING btree ("posts_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "homepage" CASCADE;
  DROP TABLE "homepage_rels" CASCADE;`)
}
