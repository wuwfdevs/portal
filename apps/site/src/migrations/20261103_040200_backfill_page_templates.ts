import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Pages made before templates existed carry a layout of blocks and no body. Adding the `template` column gave every existing
 * row (and every saved version) the new default, `standard`, which hides their Hero and Content tabs in the admin and shows an
 * empty body in their place: typing in it would replace the page's content. Those pages are `blocks` pages. This marks them.
 *
 * A page counts as an old one only if it is `standard` with no body AND has at least one layout block, so a standard page an
 * editor has already started is left alone. Safe to run on a database with no pages (it changes nothing) and to run twice.
 */
const BLOCK_TABLES = ['archive', 'content', 'cta', 'form_block', 'media_block'] as const
const hasLayout = (prefix: string, parent: string) => BLOCK_TABLES.map((t) => `EXISTS (SELECT 1 FROM "${prefix}_${t}" b WHERE b."_parent_id" = ${parent}."id")`).join(' OR ')

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(
    sql.raw(`UPDATE "pages" p SET "template" = 'blocks' WHERE p."template" = 'standard' AND p."body" IS NULL AND (${hasLayout('pages_blocks', 'p')});`),
  )
  await db.execute(
    sql.raw(`UPDATE "_pages_v" v SET "version_template" = 'blocks' WHERE v."version_template" = 'standard' AND v."version_body" IS NULL AND (${hasLayout('_pages_v_blocks', 'v')});`),
  )
}

/** Nothing to undo: which rows were `standard` before is not recorded, and `blocks` is the right value for them either way. */
export async function down(_args: MigrateDownArgs): Promise<void> {}
