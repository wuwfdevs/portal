import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { STARTER_CALENDAR_GUIDELINES, STARTER_FELLOWSHIP_POLICY, STARTER_MEMBERSHIP_APPEAL } from '@/lib/shared-text/starter'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "shared_text_calendar_guidelines_paragraphs" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"lead" varchar,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "shared_text_fellowship_policy_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"term" varchar NOT NULL,
  	"text" varchar NOT NULL
  );
  
  CREATE TABLE "shared_text" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"calendar_guidelines_title" varchar,
  	"membership_appeal_text" varchar,
  	"membership_appeal_button_label" varchar,
  	"membership_appeal_button_href" varchar,
  	"fellowship_policy_title" varchar,
  	"fellowship_policy_link_label" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "shared_text_calendar_guidelines_paragraphs" ADD CONSTRAINT "shared_text_calendar_guidelines_paragraphs_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shared_text"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "shared_text_fellowship_policy_items" ADD CONSTRAINT "shared_text_fellowship_policy_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."shared_text"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "shared_text_calendar_guidelines_paragraphs_order_idx" ON "shared_text_calendar_guidelines_paragraphs" USING btree ("_order");
  CREATE INDEX "shared_text_calendar_guidelines_paragraphs_parent_id_idx" ON "shared_text_calendar_guidelines_paragraphs" USING btree ("_parent_id");
  CREATE INDEX "shared_text_fellowship_policy_items_order_idx" ON "shared_text_fellowship_policy_items" USING btree ("_order");
  CREATE INDEX "shared_text_fellowship_policy_items_parent_id_idx" ON "shared_text_fellowship_policy_items" USING btree ("_parent_id");`)

  // The words that were typed in code, copied in so nothing a visitor reads changes (lib/shared-text/starter.ts). One row, as a global is.
  const appeal = STARTER_MEMBERSHIP_APPEAL
  const policy = STARTER_FELLOWSHIP_POLICY
  await db.execute(sql`
    INSERT INTO "shared_text" ("id", "calendar_guidelines_title", "membership_appeal_text", "membership_appeal_button_label", "membership_appeal_button_href", "fellowship_policy_title", "fellowship_policy_link_label", "updated_at", "created_at")
    VALUES (1, ${STARTER_CALENDAR_GUIDELINES.title}, ${appeal.text}, ${appeal.buttonLabel}, ${appeal.buttonHref}, ${policy.title}, ${policy.linkLabel}, now(), now())`)
  await db.execute(sql`SELECT setval(pg_get_serial_sequence('shared_text', 'id'), 1, true)`)
  for (const [index, p] of STARTER_CALENDAR_GUIDELINES.paragraphs.entries()) {
    await db.execute(sql`
      INSERT INTO "shared_text_calendar_guidelines_paragraphs" ("_order", "_parent_id", "id", "lead", "text")
      VALUES (${index + 1}, 1, substr(replace(gen_random_uuid()::text, '-', ''), 1, 24), ${p.lead || null}, ${p.text})`)
  }
  for (const [index, item] of policy.items.entries()) {
    await db.execute(sql`
      INSERT INTO "shared_text_fellowship_policy_items" ("_order", "_parent_id", "id", "term", "text")
      VALUES (${index + 1}, 1, substr(replace(gen_random_uuid()::text, '-', ''), 1, 24), ${item.term}, ${item.text})`)
  }
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "shared_text_calendar_guidelines_paragraphs" CASCADE;
  DROP TABLE "shared_text_fellowship_policy_items" CASCADE;
  DROP TABLE "shared_text" CASCADE;`)
}
