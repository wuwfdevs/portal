import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Starting values for The Voyager's hub (/voyager). The hub answers 404 until its settings name a publishing identity, so a
 * new or migrated database (a staging copy, a preview, a fresh install) had no page at all, and the header's seeded "The
 * Voyager (student newsroom)" link led nowhere. Unearthing Florida had the same gap and got the same fix
 * (`20261107_080000_unearthing_hub_start`).
 *
 * This creates the "The Voyager" publishing identity if none has that slug, and points the hub settings at it when they name
 * no identity yet. Anything an editor has already chosen is left alone. It adds no stories, sections or staff: the page says
 * "More stories soon" until student editors publish under the identity. `down` does nothing: see its comment.
 */

const SLUG = 'the-voyager'

async function rows<T>(db: MigrateUpArgs['db'], query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as { rows?: T[] }
  return result.rows ?? []
}

export async function up({ db }: MigrateUpArgs): Promise<void> {
  let identity = (await rows<{ id: number }>(db, sql`SELECT "id" FROM "publishing_identities" WHERE "slug" = ${SLUG} LIMIT 1;`))[0]
  if (!identity) {
    identity = (
      await rows<{ id: number }>(
        db,
        sql`INSERT INTO "publishing_identities" ("name", "slug", "kind", "tagline", "updated_at", "created_at")
            VALUES ('The Voyager', ${SLUG}, 'partner', 'The student newspaper of the University of West Florida', now(), now())
            RETURNING "id";`,
      )
    )[0]
  }

  const hub = (await rows<{ id: number; identity_id: number | null }>(db, sql`SELECT "id", "identity_id" FROM "voyager_hub" ORDER BY "id" LIMIT 1;`))[0]
  if (!hub) {
    await db.execute(sql`INSERT INTO "voyager_hub" ("identity_id", "updated_at", "created_at") VALUES (${identity.id}, now(), now());`)
  } else if (hub.identity_id === null) {
    await db.execute(sql`UPDATE "voyager_hub" SET "identity_id" = ${identity.id}, "updated_at" = now() WHERE "id" = ${hub.id};`)
  }
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  // Deliberately empty. `up` reuses an identity and a hub that may already exist (an editor's, or a hand-made copy), and keeps no
  // record of which rows it added, so removing by slug could delete editorial data it did not create. The rows are ordinary
  // content: unlink or delete them in the admin if they are not wanted.
}
