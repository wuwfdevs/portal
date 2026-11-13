import type { postgresAdapter } from '@payloadcms/db-postgres'
import { index, integer, pgTable, text, timestamp, vector } from '@payloadcms/db-postgres/drizzle/pg-core'

import { EMBEDDING_DIMENSIONS } from '../lib/embeddings/config'

type SchemaHook = NonNullable<NonNullable<Parameters<typeof postgresAdapter>[0]['afterSchemaInit']>[number]>

/**
 * `story_embeddings`: one vector per WUWF story, for semantic search and "similar stories".
 *
 * It is a plain table beside Payload's, not a collection: nothing here is editable, and a collection would expose the vectors
 * through the REST and GraphQL APIs and rewrite the story's own `updated_at` and version history every time an embedding is
 * written (the Portal's Resources search learned the same lesson). Declaring it through the adapter's schema hook still keeps it in
 * Payload's migration snapshot, so `pnpm verify:migrations` covers it and the dev-time schema push does not try to drop it.
 *
 * Rows follow the story: deleting a story deletes its row (`on delete cascade`). The row records the model and a hash of the text it
 * was made from, so staleness is a comparison, not a flag a trigger has to keep.
 * Only the server reads it, through `lib/embeddings/store.ts`; the stories it points to are then loaded through the normal access
 * rules, so a draft or an unpublished story can never appear because it has a vector.
 */
export const storyEmbeddingsSchema: SchemaHook = ({ schema }) => {
  const posts = schema.tables.posts
  const storyEmbeddings = pgTable(
    'story_embeddings',
    {
      postId: integer('post_id')
        .primaryKey()
        .references(() => posts.id, { onDelete: 'cascade' }),
      embedding: vector('embedding', { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
      model: text('model').notNull(),
      contentHash: text('content_hash').notNull(),
      embeddedAt: timestamp('embedded_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
    },
    (t) => [index('story_embeddings_embedding_hnsw').using('hnsw', t.embedding.op('vector_cosine_ops'))],
  )
  return { ...schema, tables: { ...schema.tables, story_embeddings: storyEmbeddings } }
}
