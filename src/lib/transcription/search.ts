import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { getEmbeddingProvider, toVectorLiteral } from "./embeddings";

// One search box over the whole archive (design doc §3F). The ranking lives
// in the tw_search() RPC — keyword and semantic halves merged with reciprocal
// rank fusion — so this module only has to turn the query into an embedding
// and the rows into something a card can render.

/**
 * What a hit actually is. "transcript" means a window of transcript nobody
 * has clipped — just a place in the audio where the query comes up;
 * "document" is the same idea for a window of extracted document text
 * (docs/sourcework-design.md §8.8); "clip" means someone saved and titled a
 * passage (audio or document); "project" means nothing in the source
 * matched but the recording/document's own title or background did.
 */
export type SearchResultKind = "clip" | "transcript" | "document" | "project";

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  projectId: string;
  /** Which of the project's (possibly several, since Phase 3a) sources this hit belongs to — null for a project-kind hit. Needed to deep-link to the right source pill. */
  sourceId: string | null;
  projectTitle: string;
  /** The project's background text — the context a stranger to this recording needs (§3G). */
  projectDescription: string | null;
  interviewDate: string | null;
  startMs: number | null;
  endMs: number | null;
  /** Document hits only (chunk or excerpt) — see docs/sourcework-design.md §8.8. */
  pageNumber: number | null;
  /** A clip's editorial title; null for the other kinds. */
  title: string | null;
  snippet: string;
  speakerLabel: string | null;
}

const DEFAULT_LIMIT = 30;

export interface SearchScope {
  limit?: number;
  /** Narrows to one project's sources — the project workspace's own search box. */
  projectId?: string;
  /** Narrows to one source's own text + excerpts — the excerpt pane's search box, for a source with hundreds of excerpts. */
  sourceId?: string;
}

/**
 * Hybrid search across transcripts, clips, and project metadata.
 *
 * The query embedding is best-effort: with no embeddings key configured, or
 * if the provider is having a bad minute, this passes null and the RPC runs
 * its keyword half alone. Degrading to keyword-only search is a far better
 * failure than an error page over a search box.
 *
 * `projectId`/`sourceId` (docs/sourcework-design.md's search scoping —
 * 20260803130000_tw_search_scoping.sql) narrow the same ranked query rather
 * than standing up a separate function; the tool-wide search box (the only
 * caller before this) simply never sets either.
 */
export async function searchArchive(
  query: string,
  scope: SearchScope = {},
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const rows = unwrapRead(
    await supabase.rpc("tw_search", {
      query_text: trimmed,
      query_embedding: await embedQuery(trimmed),
      match_limit: scope.limit ?? DEFAULT_LIMIT,
      project_id_filter: scope.projectId ?? null,
      source_id_filter: scope.sourceId ?? null,
    }),
    "search results",
  );

  return (rows ?? []).map((row) => ({
    kind: row.kind as SearchResultKind,
    id: row.result_id,
    projectId: row.project_id,
    sourceId: row.source_id,
    projectTitle: row.project_title,
    projectDescription: row.project_description,
    interviewDate: row.interview_date,
    startMs: row.start_ms,
    endMs: row.end_ms,
    pageNumber: row.page_number,
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
