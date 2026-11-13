/**
 * Story embeddings: the fixed choices and the two switches. Pure (no Payload, no network).
 *
 * The model and its width are constants, not settings: the database column is `vector(1536)`, every row records the model that made
 * it, and changing either is a deliberate migration plus a re-embed (`scripts/embeddings/backfill.ts --all`), never an environment edit.
 */

export const EMBEDDING_MODEL = 'text-embedding-3-small'
export const EMBEDDING_DIMENSIONS = 1536

/** The model reads about 8,000 tokens; this is a safe cut (about 6,000 tokens of English). A longer story is embedded from its start. */
export const MAX_EMBED_CHARS = 24_000

/** Words that go to the provider for one search. Longer queries are cut (the search page already stops at 100 characters). */
export const MAX_QUERY_CHARS = 200

type Env = Record<string, string | undefined>

/**
 * Indexing: stories are embedded only when a key is present. No key, no embeddings and no calls; everything below still works
 * on keyword search alone (the site must stay usable if a third-party service is down or unset).
 */
export function embeddingKey(env: Env = process.env): string | null {
  const key = env.OPENAI_API_KEY?.trim()
  return key ? key : null
}

/**
 * Searching: a visitor's search words go to the embedding provider, which is a disclosure a key alone does not approve. It also needs the
 * **"Find stories by meaning in search" setting in Site settings** (a publisher or administrator turns it on, in the admin, with no deploy),
 * so a key can be set for indexing while search stays keyword-only until the owner decides (ROADMAP: Needs the owner).
 */
export function semanticSearchAllowed(settingOn: boolean | null | undefined, env: Env = process.env): boolean {
  return embeddingKey(env) !== null && settingOn === true
}
