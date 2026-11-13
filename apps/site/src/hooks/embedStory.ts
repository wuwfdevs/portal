import type { CollectionAfterChangeHook } from 'payload'

import { embedStory, getEmbeddingProvider } from '@/lib/embeddings/service'

import type { Post } from '../payload-types'

/** A save waits at most this long for its embedding. Past it the save goes on and the sweep (`scripts/embeddings/backfill.ts`) catches up. */
const EMBED_BUDGET_MS = 8000

/**
 * Keeps a story's vector current when it is saved. A no-op unless an embedding key is configured. Never fails or blocks a save:
 * an error is logged (the story's id and the error's name; never its text) and the story is picked up by the next backfill run, which
 * embeds exactly the stories whose stored hash no longer matches.
 *
 * The importer sets `context.disableEmbedding` and embeds in one pass afterwards (`scripts/grove/IMPORT.md`, step 5), so importing
 * thousands of stories is not thousands of inline provider calls.
 */
export const embedStoryAfterChange: CollectionAfterChangeHook<Post> = async ({ doc, req }) => {
  const { payload, context } = req
  if (context.disableEmbedding) return doc
  const provider = getEmbeddingProvider()
  if (!provider) return doc
  try {
    await Promise.race([
      embedStory(payload, doc, provider, req),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), EMBED_BUDGET_MS)),
    ])
  } catch (error) {
    payload.logger.error(`Story ${doc.id} was saved but not embedded (${error instanceof Error ? error.message : 'unknown error'}); the next backfill run will do it.`)
  }
  return doc
}
