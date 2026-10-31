import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "site_settings_embed_hosts" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"host" varchar NOT NULL
  );
  
  ALTER TABLE "site_settings_embed_hosts" ADD CONSTRAINT "site_settings_embed_hosts_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_settings_embed_hosts_order_idx" ON "site_settings_embed_hosts" USING btree ("_order");
  CREATE INDEX "site_settings_embed_hosts_parent_id_idx" ON "site_settings_embed_hosts" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "site_settings_embed_hosts" CASCADE;`)
}
