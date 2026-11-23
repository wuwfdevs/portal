import { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'

/**
 * The schema snapshot for a show's home page (`pages.show`, `pages.isShowHome`, `pages.navHidden`) and the three hub themes. The DDL is in `20261119_031423_show_home_page_columns`, which sorts
 * before every migration that writes pages through the Local API (CLAUDE.md, "Database"); this file changes nothing and exists so the next `migrate:create` diffs against a snapshot that has them.
 */
export async function up(_args: MigrateUpArgs): Promise<void> {}

export async function down(_args: MigrateDownArgs): Promise<void> {}
