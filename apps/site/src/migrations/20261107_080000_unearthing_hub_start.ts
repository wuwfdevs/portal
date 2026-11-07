import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Starting values for the Unearthing Florida hub (/unearthing-florida). The hub answers 404 until its settings name a
 * production, so a new or migrated database (a staging copy, a preview, a fresh install) had no page at all.
 *
 * This creates the "Unearthing Florida" production if none has that slug, points the hub settings at it when they name
 * no production yet, and links the series' existing stories (those at /unearthing-florida/...) that belong to no
 * production. Anything an editor has already chosen is left alone. The production is unlisted, so it does not appear in
 * the show directory. `down` does nothing: see its comment.
 */

const SLUG = 'unearthing-florida'

async function rows<T>(db: MigrateUpArgs['db'], query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] }
  return result.rows ?? []
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  let production = (await rows<{ id: number }>(db, sql`SELECT "id" FROM "productions" WHERE "slug" = ${SLUG} LIMIT 1;`))[0]
  if (!production) {
    production = (
      await rows<{ id: number }>(
        db,
        sql`INSERT INTO "productions" ("title", "slug", "path", "kind", "listed", "summary", "updated_at", "created_at")
            VALUES ('Unearthing Florida', ${SLUG}, '/shows/unearthing-florida', 'original', false, 'Stories of Florida''s buried and forgotten history.', now(), now())
            RETURNING "id";`,
      )
    )[0]
  }

  const hub = (await rows<{ id: number; production_id: number | null }>(db, sql`SELECT "id", "production_id" FROM "unearthing_hub" ORDER BY "id" LIMIT 1;`))[0]
  if (!hub) {
    await db.execute(sql`INSERT INTO "unearthing_hub" ("production_id", "updated_at", "created_at") VALUES (${production.id}, now(), now());`)
  } else if (hub.production_id === null) {
    await db.execute(sql`UPDATE "unearthing_hub" SET "production_id" = ${production.id}, "updated_at" = now() WHERE "id" = ${hub.id};`)
  }

  await db.execute(sql`UPDATE "posts" SET "production_id" = ${production.id} WHERE "production_id" IS NULL AND "path" LIKE '/unearthing-florida/%';`)
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Deliberately empty. `up` reuses a production, a hub and story links that may already exist (an editor's, or a hand-made
  // copy), and keeps no record of which rows it added, so removing by slug could delete editorial data it did not create.
  // The rows are ordinary content: unlink or delete them in the admin if they are not wanted.
}
