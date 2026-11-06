import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "performances" ADD COLUMN "virtual_tickets_url" varchar;
  ALTER TABLE "performances" ADD COLUMN "recording_url" varchar;
  ALTER TABLE "_performances_v" ADD COLUMN "version_virtual_tickets_url" varchar;
  ALTER TABLE "_performances_v" ADD COLUMN "version_recording_url" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "performances" DROP COLUMN "virtual_tickets_url";
  ALTER TABLE "performances" DROP COLUMN "recording_url";
  ALTER TABLE "_performances_v" DROP COLUMN "version_virtual_tickets_url";
  ALTER TABLE "_performances_v" DROP COLUMN "version_recording_url";`)
}
