import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "placement_counts" (
  	"day" date NOT NULL,
  	"placement_id" integer NOT NULL,
  	"zone" text NOT NULL,
  	"kind" text NOT NULL,
  	"sponsor_id" integer,
  	"filter_version" text NOT NULL,
  	"measurable" integer DEFAULT 0 NOT NULL,
  	"viewable" integer DEFAULT 0 NOT NULL,
  	"clicked" integer DEFAULT 0 NOT NULL,
  	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "placement_counts_pkey" PRIMARY KEY("day","placement_id","zone","filter_version")
  );
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "placement_counts" CASCADE;`)
}
