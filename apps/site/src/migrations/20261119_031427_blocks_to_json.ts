/**
 * Blocks fields become one jsonb column each (`blocksAsJSON`): stories' featured media, the starter's page layout, the form builder's
 * fields and the pages' `sections`. `up` is Payload's own converter (`payload migrate:create ... --file
 * @payloadcms/db-postgres/blocks-as-json`) with one change: it skips the data pass when the tables hold no rows (see `up`). It reads every
 * document and version, drops the block tables, adds the jsonb columns and writes the rows back, in one transaction.
 * `blocksAsJSON: true` must already be in payload.config.ts when this runs, or the write-back fails (and rolls back).
 *
 * `down` is not Payload's (its generated `down` is empty and leaves the JSON schema in place). It is the same steps backwards: read
 * everything while the jsonb columns exist, make the schema diff from the JSON schema to the relational one with drizzle-kit, run it, write
 * the rows back with `blocksAsJSON` off. It builds the relational schema from the config as it is when `down` runs, so run it with
 * `blocksAsJSON: false` set in the config (a `down` run later, after more blocks fields exist, would also make tables for those).
 * Tested up, down, up on seeded rows (PAGE-BLOCKS.md; ROADMAP.md, Phase 0 findings).
 */
import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

import { getBlocksToJsonMigrator } from '@payloadcms/db-postgres/migration-utils'
import { fileURLToPath } from 'url'
import path from 'path'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// Configure migration options (optional)
const BATCH_SIZE = 100 // Number of entities to process per batch
const TEMP_FOLDER = path.resolve(dirname, '.payload-blocks-migration') // Folder path to store migration batch


/** Whether any table that holds a blocks field (at the time of this migration) has a row. */
async function tablesHoldRows(db: MigrateUpArgs['db']): Promise<boolean> {
  for (const table of ['pages', '_pages_v', 'posts', '_posts_v', 'forms']) {
    const result = await db.execute(sql.raw(`select 1 from "${table}" limit 1`))
    if (result.rows.length > 0) return true
  }
  return false
}

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  
  const migrator = getBlocksToJsonMigrator(payload)
  // The converter reads every document through Payload with the config as it is when this runs, so on an empty database (a fresh install,
  // a replay of the migrations, production before launch) its read can name columns a LATER migration adds, and fail. With no rows there is
  // nothing to move, so only the schema statements run. With rows, run it before any later migration that changes pages, stories or forms
  // (the preview build that first applies this one to a database holding content).
  const hasRows = await tablesHoldRows(db)
  if (hasRows) {
    migrator.setTempFolder(TEMP_FOLDER)
    await migrator.collectAndSaveEntitiesToBatches(req, { batchSize: BATCH_SIZE })
  }
  
  await db.execute(sql`
   ALTER TABLE "pages_blocks_section_cards_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_section_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_cta_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_content_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_content" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_archive" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "pages_blocks_form_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_section_cards_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_section_cards" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_cta_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_cta" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_content_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_content" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_archive" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_pages_v_blocks_form_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_gallery_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_video_player" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "posts_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_media_block" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_gallery_images" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_gallery" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_video_player" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "_posts_v_blocks_embed" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_checkbox" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_country" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_email" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_message" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_number" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_select_options" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_select" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_state" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_text" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "forms_blocks_textarea" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pages_blocks_section_cards_cards" CASCADE;
  DROP TABLE "pages_blocks_section_cards" CASCADE;
  DROP TABLE "pages_blocks_cta_links" CASCADE;
  DROP TABLE "pages_blocks_cta" CASCADE;
  DROP TABLE "pages_blocks_content_columns" CASCADE;
  DROP TABLE "pages_blocks_content" CASCADE;
  DROP TABLE "pages_blocks_media_block" CASCADE;
  DROP TABLE "pages_blocks_archive" CASCADE;
  DROP TABLE "pages_blocks_form_block" CASCADE;
  DROP TABLE "_pages_v_blocks_section_cards_cards" CASCADE;
  DROP TABLE "_pages_v_blocks_section_cards" CASCADE;
  DROP TABLE "_pages_v_blocks_cta_links" CASCADE;
  DROP TABLE "_pages_v_blocks_cta" CASCADE;
  DROP TABLE "_pages_v_blocks_content_columns" CASCADE;
  DROP TABLE "_pages_v_blocks_content" CASCADE;
  DROP TABLE "_pages_v_blocks_media_block" CASCADE;
  DROP TABLE "_pages_v_blocks_archive" CASCADE;
  DROP TABLE "_pages_v_blocks_form_block" CASCADE;
  DROP TABLE "posts_blocks_media_block" CASCADE;
  DROP TABLE "posts_blocks_gallery_images" CASCADE;
  DROP TABLE "posts_blocks_gallery" CASCADE;
  DROP TABLE "posts_blocks_video_player" CASCADE;
  DROP TABLE "posts_blocks_embed" CASCADE;
  DROP TABLE "_posts_v_blocks_media_block" CASCADE;
  DROP TABLE "_posts_v_blocks_gallery_images" CASCADE;
  DROP TABLE "_posts_v_blocks_gallery" CASCADE;
  DROP TABLE "_posts_v_blocks_video_player" CASCADE;
  DROP TABLE "_posts_v_blocks_embed" CASCADE;
  DROP TABLE "forms_blocks_checkbox" CASCADE;
  DROP TABLE "forms_blocks_country" CASCADE;
  DROP TABLE "forms_blocks_email" CASCADE;
  DROP TABLE "forms_blocks_message" CASCADE;
  DROP TABLE "forms_blocks_number" CASCADE;
  DROP TABLE "forms_blocks_select_options" CASCADE;
  DROP TABLE "forms_blocks_select" CASCADE;
  DROP TABLE "forms_blocks_state" CASCADE;
  DROP TABLE "forms_blocks_text" CASCADE;
  DROP TABLE "forms_blocks_textarea" CASCADE;
  ALTER TABLE "pages_rels" DROP CONSTRAINT "pages_rels_categories_fk";
  
  ALTER TABLE "_pages_v_rels" DROP CONSTRAINT "_pages_v_rels_categories_fk";
  
  DROP INDEX "pages_rels_categories_id_idx";
  DROP INDEX "_pages_v_rels_categories_id_idx";
  ALTER TABLE "pages" ADD COLUMN "sections" jsonb;
  ALTER TABLE "pages" ADD COLUMN "layout" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_sections" jsonb;
  ALTER TABLE "_pages_v" ADD COLUMN "version_layout" jsonb;
  ALTER TABLE "posts" ADD COLUMN "featured_media" jsonb;
  ALTER TABLE "_posts_v" ADD COLUMN "version_featured_media" jsonb;
  ALTER TABLE "forms" ADD COLUMN "fields" jsonb;
  ALTER TABLE "pages_rels" DROP COLUMN "categories_id";
  ALTER TABLE "_pages_v_rels" DROP COLUMN "categories_id";
  DROP TYPE "public"."enum_pages_blocks_section_cards_tone";
  DROP TYPE "public"."enum_pages_blocks_cta_links_link_type";
  DROP TYPE "public"."enum_pages_blocks_cta_links_link_appearance";
  DROP TYPE "public"."enum_pages_blocks_content_columns_size";
  DROP TYPE "public"."enum_pages_blocks_content_columns_link_type";
  DROP TYPE "public"."enum_pages_blocks_content_columns_link_appearance";
  DROP TYPE "public"."enum_pages_blocks_media_block_alignment";
  DROP TYPE "public"."enum_pages_blocks_archive_populate_by";
  DROP TYPE "public"."enum_pages_blocks_archive_relation_to";
  DROP TYPE "public"."enum__pages_v_blocks_section_cards_tone";
  DROP TYPE "public"."enum__pages_v_blocks_cta_links_link_type";
  DROP TYPE "public"."enum__pages_v_blocks_cta_links_link_appearance";
  DROP TYPE "public"."enum__pages_v_blocks_content_columns_size";
  DROP TYPE "public"."enum__pages_v_blocks_content_columns_link_type";
  DROP TYPE "public"."enum__pages_v_blocks_content_columns_link_appearance";
  DROP TYPE "public"."enum__pages_v_blocks_media_block_alignment";
  DROP TYPE "public"."enum__pages_v_blocks_archive_populate_by";
  DROP TYPE "public"."enum__pages_v_blocks_archive_relation_to";
  DROP TYPE "public"."enum_posts_blocks_media_block_alignment";
  DROP TYPE "public"."enum_posts_blocks_gallery_layout";
  DROP TYPE "public"."enum__posts_v_blocks_media_block_alignment";
  DROP TYPE "public"."enum__posts_v_blocks_gallery_layout";`)
  payload.logger.info("Executed blocks to JSON migration statements.")
  
  if (hasRows) await migrator.migrateEntitiesFromTempFolder(req, { clearBatches: true })
    
}

/** True when a collection or global (or a group, tab or list inside it) has a blocks field. */
const hasBlocksField = (entity: { flattenedFields: any[] }): boolean =>
  entity.flattenedFields.some((f) => f.type === 'blocks' || ('flattenedFields' in f && hasBlocksField({ flattenedFields: f.flattenedFields })))

type Entity = { kind: 'doc' | 'version' | 'global' | 'globalVersion'; slug: string; id?: number | string; data: any }

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  const migrator: any = getBlocksToJsonMigrator(payload)
  const adapter: any = payload.db
  const BATCH = 100

  // 1. Read every document and version while the jsonb columns still exist.
  adapter.blocksAsJSON = true
  migrator.resetSchema()
  await adapter.init()
  await adapter.connect()
  const entities: Entity[] = []
  for (const collection of payload.config.collections.filter((c: any) => hasBlocksField(c))) {
    for (let page = 1, more = true; more; page++) {
      const r = await adapter.find({ collection: collection.slug, limit: BATCH, page })
      for (const d of r.docs) entities.push({ kind: 'doc', slug: collection.slug, id: d.id, data: d })
      more = r.hasNextPage
    }
    if (collection.versions) {
      for (let page = 1, more = true; more; page++) {
        const r = await adapter.findVersions({ collection: collection.slug, limit: BATCH, page })
        for (const v of r.docs) entities.push({ kind: 'version', slug: collection.slug, id: v.id, data: v })
        more = r.hasNextPage
      }
    }
  }
  for (const g of payload.config.globals.filter((x: any) => hasBlocksField(x))) {
    entities.push({ kind: 'global', slug: g.slug, data: await adapter.findGlobal({ slug: g.slug }) })
    if (g.versions) {
      for (let page = 1, more = true; more; page++) {
        const r = await adapter.findGlobalVersions({ global: g.slug, limit: BATCH, page })
        for (const v of r.docs) entities.push({ kind: 'globalVersion', slug: g.slug, id: v.id, data: v })
        more = r.hasNextPage
      }
    }
  }
  payload.logger.info(`blocks_to_json down: read ${entities.length} documents and versions`)

  // 2. The schema change: drizzle-kit's diff from the JSON schema to the relational one, with its prompts answered.
  const { generateDrizzleJson, generateMigration } = adapter.requireDrizzleKit()
  const before = await generateDrizzleJson(adapter.schema)
  adapter.blocksAsJSON = false
  migrator.resetSchema()
  await adapter.init()
  const after = await generateDrizzleJson(adapter.schema)
  const write = process.stdout.write
  process.stdout.write = (() => true) as typeof process.stdout.write
  const timer = setInterval(() => process.stdin.emit('keypress', '\n', { name: 'return', ctrl: false }), 25)
  let statements: string[]
  try {
    statements = await generateMigration(before, after)
  } finally {
    clearInterval(timer)
    process.stdout.write = write
  }
  for (const statement of statements.join('\n').split(/-->\s*statement-breakpoint/).map((x) => x.trim()).filter(Boolean)) {
    await db.execute(sql.raw(statement))
  }
  payload.logger.info('blocks_to_json down: relational block tables created')

  // 3. Write the rows back with blocksAsJSON off.
  await adapter.connect()
  await migrator.syncTransactionDrizzleInstance(req)
  for (const e of entities) {
    if (e.kind === 'doc') await adapter.updateOne({ collection: e.slug, data: e.data, joins: false, req, where: { id: { equals: e.id } } })
    else if (e.kind === 'version') await adapter.updateVersion({ id: e.id, collection: e.slug, req, versionData: e.data })
    else if (e.kind === 'global') await adapter.updateGlobal({ slug: e.slug, data: e.data, req })
    else await adapter.updateGlobalVersion({ id: e.id, global: e.slug, req, versionData: e.data })
  }
  payload.logger.info(`blocks_to_json down: wrote ${entities.length} documents and versions back`)
}
