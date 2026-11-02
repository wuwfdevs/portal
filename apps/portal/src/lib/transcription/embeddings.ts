import "server-only";

// Embeddings behind a thin adapter, mirroring the ASR provider decision (see
// asr-provider.ts and design doc §6): one interface, one implementation, so a
// provider change is a contained edit rather than a rewrite.
//
// Hand-rolled fetch rather than the `openai` SDK on purpose — this is one
// POST with a JSON body, and CLAUDE.md asks for a specific reason before a
// new dependency joins the tree. There isn't one for a single endpoint.

/** Fixed by the vector(1536) columns in the Phase 5 migration — see below. */
export const EMBEDDING_DIMENSIONS = 1536;

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDINGS_URL = "https://api.openai.com/v1/embeddings";

/**
 * Requests per call. The API accepts far more, but a batch is also the unit
 * of retry and of memory, and an hour-long interview is only ~80 chunks.
 */
const BATCH_SIZE = 64;

export interface EmbeddingProvider {
  readonly dimensions: number;
  /** Vectors in the same order as `texts`. Throws on provider failure. */
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * The configured provider, or null when no API key is set.
 *
 * Null is a supported state, not an error: without a key the workspace still
 * chunks transcripts and still searches them by keyword (the migration's
 * embedding columns just stay null and tw_search runs its keyword half). That
 * keeps the tool working in local development and in any deploy where the key
 * hasn't been provisioned yet, instead of failing transcription outright.
 */
export function getEmbeddingProvider(): EmbeddingProvider | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return {
    dimensions: EMBEDDING_DIMENSIONS,
    async embed(texts: string[]): Promise<number[][]> {
      const vectors: number[][] = [];

      for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
        const batch = texts.slice(offset, offset + BATCH_SIZE);
        const response = await fetch(EMBEDDINGS_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: EMBEDDING_MODEL,
            input: batch,
            dimensions: EMBEDDING_DIMENSIONS,
          }),
        });

        if (!response.ok) {
          // Read the body for the provider's actual complaint (bad key, rate
          // limit, oversized input) — but never let it reach a user-facing
          // string; callers log this and carry on unembedded.
          const detail = await response.text().catch(() => "");
          throw new Error(
            `Embeddings request failed (${response.status}): ${detail.slice(0, 300)}`,
          );
        }

        const payload = (await response.json()) as {
          data?: { index: number; embedding: number[] }[];
        };
        const data = payload.data ?? [];
        if (data.length !== batch.length) {
          throw new Error(
            `Embeddings response had ${data.length} vectors for ${batch.length} inputs`,
          );
        }

        // The API documents index order but sorting is cheap insurance: a
        // mis-ordered batch would silently attach every embedding to the
        // wrong chunk, which no test downstream would catch.
        for (const item of [...data].sort((a, b) => a.index - b.index)) {
          vectors.push(item.embedding);
        }
      }

      return vectors;
    },
  };
}

/**
 * pgvector's text input format. supabase-js sends a JS array as a JSON array,
 * which Postgres will accept for a vector column — but only sometimes, and
 * silently as text otherwise. Formatting it explicitly keeps the RPC call and
 * the column write identical and unambiguous.
 */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
