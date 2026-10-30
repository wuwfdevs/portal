import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getEmbeddingProvider, toVectorLiteral } from "@/lib/transcription/embeddings";
import { embeddingInputForArticle } from "./articles";

// Semantic search for Resources, on Sourcework's embedding adapter
// (lib/transcription/embeddings.ts — one provider, one model, one key for
// the whole portal). The same optional-key rule applies: with no
// OPENAI_API_KEY nothing is embedded, rc_search_articles runs its keyword
// half alone, and nothing here ever throws.

type Client = Awaited<ReturnType<typeof createClient>>;

const DEFAULT_PASS_SIZE = 50;

/**
 * Embeds articles whose embedding is missing or stale
 * (rc_articles_needing_embedding: no row, or a content_hash that no longer
 * matches). Only an editor's session can write the rows, so this runs on an
 * editor's save and, best-effort, when an editor opens Resources — which is
 * also how articles a release migration inserts get embedded. Never throws;
 * a failure leaves the rows stale for the next pass.
 */
export async function embedPendingArticles(
  supabase: Client,
  limit = DEFAULT_PASS_SIZE,
): Promise<{ embedded: number; error?: string }> {
  const provider = getEmbeddingProvider();
  if (!provider) return { embedded: 0 };

  try {
    const { data, error } = await supabase.rpc("rc_articles_needing_embedding", {
      p_limit: limit,
    });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    if (rows.length === 0) return { embedded: 0 };

    const vectors = await provider.embed(rows.map(embeddingInputForArticle));
    const { error: writeError } = await supabase.from("rc_article_embeddings").upsert(
      rows.map((row, index) => ({
        article_id: row.id,
        embedding: toVectorLiteral(vectors[index]!),
        content_hash: row.content_hash,
        embedded_at: new Date().toISOString(),
      })),
      { onConflict: "article_id" },
    );
    if (writeError) throw new Error(writeError.message);
    return { embedded: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[resources] embedding pass failed", message);
    return { embedded: 0, error: message };
  }
}

/** The query's embedding as a pgvector literal, or null (no key, or the call failed). */
export async function embedSearchQuery(query: string): Promise<string | null> {
  const provider = getEmbeddingProvider();
  if (!provider) return null;
  try {
    const [vector] = await provider.embed([query]);
    return vector ? toVectorLiteral(vector) : null;
  } catch (error) {
    console.error("[resources] query embedding failed, searching by keyword only", error);
    return null;
  }
}
