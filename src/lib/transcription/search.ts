import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getEmbeddingProvider, toVectorLiteral } from "./embeddings";

// One search box over the whole archive (design doc §3F). The ranking lives
// in the tw_search() RPC — keyword and semantic halves merged with reciprocal
// rank fusion — so this module only has to turn the query into an embedding
// and the rows into something a card can render.

export type SearchResultKind = "clip" | "moment" | "project";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  projectId: string;
  projectTitle: string;
  /** The project's background text — the context a stranger to this recording needs (§3G). */
  projectDescription: string | null;
  interviewDate: string | null;
  startMs: number | null;
  endMs: number | null;
  /** A clip's editorial title; null for the other kinds. */
  title: string | null;
  snippet: string;
  speakerLabel: string | null;
}

const DEFAULT_LIMIT = 30;

/**
 * Hybrid search across transcripts, clips, and project metadata.
 *
 * The query embedding is best-effort: with no embeddings key configured, or
 * if the provider is having a bad minute, this passes null and the RPC runs
 * its keyword half alone. Degrading to keyword-only search is a far better
 * failure than an error page over a search box.
 */
export async function searchArchive(query: string, limit = DEFAULT_LIMIT): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase.rpc("tw_search", {
      query_text: trimmed,
      query_embedding: await embedQuery(trimmed),
      match_limit: limit,
    }),
    "search results",
  );

  return (rows ?? []).map((row) => ({
    kind: row.kind as SearchResultKind,
    id: row.result_id,
    projectId: row.project_id,
    projectTitle: row.project_title,
    projectDescription: row.project_description,
    interviewDate: row.interview_date,
    startMs: row.start_ms,
    endMs: row.end_ms,
    title: row.title,
    snippet: row.snippet,
    speakerLabel: row.speaker_label,
  }));
}

async function embedQuery(query: string): Promise<string | null> {
  const provider = getEmbeddingProvider();
  if (!provider) return null;

  try {
    const [vector] = await provider.embed([query]);
    return vector ? toVectorLiteral(vector) : null;
  } catch (error) {
    console.error("[transcription] query embedding failed, falling back to keyword search", error);
    return null;
  }
}

/** Whether semantic ranking is actually available, for the search box's own hint text. */
export function isSemanticSearchConfigured(): boolean {
  return getEmbeddingProvider() !== null;
}
