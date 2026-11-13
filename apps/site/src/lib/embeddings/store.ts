import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'

/**
 * The only code that touches `story_embeddings` (declared in src/db/storyEmbeddings.ts). Server only. It speaks in post ids and
 * numbers: it never returns a story, so nothing read here can show an unpublished or restricted story. Callers load the stories
 * through the Local API with access control on.
 *
 * Queries are parameterised; a vector is passed as pgvector's text form ('[0.1,0.2,...]') and cast in SQL.
 */

/** `(1, 2, 3)` as bound parameters. (Drizzle spreads a JS array into one parameter each, so `= ANY($1::int[])` does not work.) */
const idList = (ids: readonly number[]) => sql.join(ids.map((id) => sql`${id}`), sql`, `)

type Db = { execute: (query: ReturnType<typeof sql>) => Promise<{ rows?: unknown[] }> }
type Adapter = { drizzle: Db; sessions?: Record<string, { db?: Db } | undefined> }

/**
 * The connection to run on. Called from a save hook, `req` carries the save's open transaction, and the write MUST join it: the story
 * row it points to is not visible to any other connection until the save commits, so the foreign key would fail on a separate one
 * (this is what Payload's own `getTransaction` does). With no `req`, or once the transaction is over, it is the pool.
 */
async function db(payload: Payload, req?: Pick<PayloadRequest, 'transactionID'>): Promise<Db> {
  const adapter = payload.db as unknown as Adapter
  if (req?.transactionID) {
    const session = adapter.sessions?.[String(await req.transactionID)]
    if (session?.db) return session.db
  }
  return adapter.drizzle
}

async function rows<T>(payload: Payload, query: ReturnType<typeof sql>, req?: Pick<PayloadRequest, 'transactionID'>): Promise<T[]> {
  const result = await (await db(payload, req)).execute(query)
  return (result.rows ?? []) as T[]
}

type Req = Pick<PayloadRequest, 'transactionID'>

/** pgvector's text form. Rejects anything that is not a finite number, so a bad vector fails here and not as a SQL error. */
export function vectorLiteral(vector: readonly number[]): string {
  if (vector.length === 0 || vector.some((n) => !Number.isFinite(n))) throw new Error('Invalid embedding vector')
  return `[${vector.join(',')}]`
}

export type StoredEmbedding = { postId: number; model: string; contentHash: string }

/** What is stored for these stories, to decide which are stale. */
export async function storedEmbeddings(payload: Payload, postIds: readonly number[], req?: Req): Promise<Map<number, StoredEmbedding>> {
  if (postIds.length === 0) return new Map()
  const found = await rows<{ post_id: number; model: string; content_hash: string }>(
    payload,
    sql`SELECT "post_id", "model", "content_hash" FROM "story_embeddings" WHERE "post_id" IN (${idList(postIds)})`,
    req,
  )
  return new Map(found.map((r) => [r.post_id, { postId: r.post_id, model: r.model, contentHash: r.content_hash }]))
}

export async function upsertEmbedding(
  payload: Payload,
  postId: number,
  vector: readonly number[],
  model: string,
  contentHash: string,
  req?: Req,
): Promise<void> {
  const literal = vectorLiteral(vector)
  await (await db(payload, req)).execute(sql`
    INSERT INTO "story_embeddings" ("post_id", "embedding", "model", "content_hash", "embedded_at")
    VALUES (${postId}, ${literal}::vector, ${model}, ${contentHash}, now())
    ON CONFLICT ("post_id") DO UPDATE
      SET "embedding" = EXCLUDED."embedding", "model" = EXCLUDED."model", "content_hash" = EXCLUDED."content_hash", "embedded_at" = now()`)
}

export async function deleteEmbeddings(payload: Payload, postIds: readonly number[]): Promise<void> {
  if (postIds.length === 0) return
  await (await db(payload)).execute(sql`DELETE FROM "story_embeddings" WHERE "post_id" IN (${idList(postIds)})`)
}

export type Neighbour = { postId: number; similarity: number }

/** The stories closest to a vector, nearest first. Similarity is cosine similarity (1 = identical direction). */
export async function nearestToVector(payload: Payload, vector: readonly number[], limit: number, options: { exceptPostId?: number } = {}): Promise<Neighbour[]> {
  const literal = vectorLiteral(vector)
  const except = options.exceptPostId ?? -1
  const found = await rows<{ post_id: number; similarity: number }>(
    payload,
    sql`SELECT "post_id", 1 - ("embedding" <=> ${literal}::vector) AS "similarity"
        FROM "story_embeddings" WHERE "post_id" <> ${except}
        ORDER BY "embedding" <=> ${literal}::vector LIMIT ${limit}`,
  )
  return found.map((r) => ({ postId: r.post_id, similarity: Number(r.similarity) }))
}

/** The stories closest to a stored story (its own vector, never recomputed). Empty when the story has no vector yet. */
export async function nearestToStory(payload: Payload, postId: number, limit: number): Promise<Neighbour[]> {
  const found = await rows<{ post_id: number; similarity: number }>(
    payload,
    sql`WITH "q" AS (SELECT "embedding" FROM "story_embeddings" WHERE "post_id" = ${postId})
        SELECT e."post_id", 1 - (e."embedding" <=> "q"."embedding") AS "similarity"
        FROM "story_embeddings" e, "q" WHERE e."post_id" <> ${postId}
        ORDER BY e."embedding" <=> "q"."embedding" LIMIT ${limit}`,
  )
  return found.map((r) => ({ postId: r.post_id, similarity: Number(r.similarity) }))
}

/** Every stored post id, for the backfill to find vectors whose story is no longer eligible. */
export async function allEmbeddedPostIds(payload: Payload): Promise<number[]> {
  return (await rows<{ post_id: number }>(payload, sql`SELECT "post_id" FROM "story_embeddings" ORDER BY "post_id"`)).map((r) => r.post_id)
}

export async function countEmbeddings(payload: Payload): Promise<number> {
  const [row] = await rows<{ n: number }>(payload, sql`SELECT count(*)::int AS "n" FROM "story_embeddings"`)
  return row?.n ?? 0
}
