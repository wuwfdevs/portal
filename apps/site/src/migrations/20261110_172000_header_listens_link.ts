import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Adds "WUWF Listens" (/listens, the listening hub) to the Community menu the starting-menus migration seeded, so the page has a
 * way in from the header. Only that seeded menu: if an editor has removed or replaced it there is nothing here to extend, and the
 * link is theirs to place in Site settings → Header (or Footer). Skipped when the menu already links to /listens. The row's id
 * starts "start-", like the others, so `down` removes exactly it.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  const menu = (await db.execute(sql`SELECT "id" FROM "header_nav_items" WHERE "id" = 'start-menu-community' LIMIT 1;`)) as { rows?: { id: string }[] }
  if (!menu.rows?.length) return
  const already = (await db.execute(
    sql`SELECT 1 FROM "header_nav_items_links" WHERE "_parent_id" = 'start-menu-community' AND "link_url" = '/listens' LIMIT 1;`,
  )) as { rows?: unknown[] }
  if (already.rows?.length) return
  await db.execute(sql`
    INSERT INTO "header_nav_items_links" ("_order", "_parent_id", "id", "link_type", "link_new_tab", "link_url", "link_label")
    SELECT COALESCE(MAX("_order"), 0) + 1, 'start-menu-community', 'start-link-community-listens', 'custom', false, '/listens', 'WUWF Listens'
    FROM "header_nav_items_links" WHERE "_parent_id" = 'start-menu-community'
    ON CONFLICT ("id") DO NOTHING;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`DELETE FROM "header_nav_items_links" WHERE "id" = 'start-link-community-listens';`)
}
