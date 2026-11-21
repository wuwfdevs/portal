import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_sections_swatch" AS ENUM('blue', 'lime', 'amber', 'teal', 'slate');
  ALTER TABLE "sections" ADD COLUMN "swatch" "enum_sections_swatch" DEFAULT 'blue';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sections" DROP COLUMN "swatch";
  DROP TYPE "public"."enum_sections_swatch";`)
}
