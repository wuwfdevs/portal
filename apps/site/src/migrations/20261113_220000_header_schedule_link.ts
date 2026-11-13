import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * The Listen live page became the broadcast schedule (/listen is now /schedule), and the starting Shows menu seeded
 * "Listen live and schedule" at /listen. This points that one seeded link at /schedule and calls it what it is. Only the
 * seeded row (id `start-link-shows-4`) and only while it still says /listen: an editor who changed it keeps their link.
 * `down` puts back exactly what this changed.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "header_nav_items_links"
    SET "link_url" = '/schedule', "link_label" = 'Broadcast schedule'
    WHERE "id" = 'start-link-shows-4' AND "link_url" = '/listen' AND "link_label" = 'Listen live and schedule';`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "header_nav_items_links"
    SET "link_url" = '/listen', "link_label" = 'Listen live and schedule'
    WHERE "id" = 'start-link-shows-4' AND "link_url" = '/schedule' AND "link_label" = 'Broadcast schedule';`)
}
