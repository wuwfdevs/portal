import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import {
  buildChunks,
  buildEmbeddingInput,
  buildClipEmbeddingInput,
  type ChunkProjectContext,
} from "./chunking";
import { getEmbeddingProvider, toVectorLiteral } from "./embeddings";

// Keeps the search index in step with the transcript. Called from three
// places: the ASR webhook (fresh transcript), the reindex action (backfill,
// and re-embedding after edits settle), and clip writes.
//
// Takes its Supabase client as an argument rather than creating one, because
// the webhook runs as the admin client (no user session for RLS to apply
// against — see that route's comment) while everything else runs as the
// signed-in member. Both are SupabaseClient<Database>; neither is assumed.

type Client = SupabaseClient<Database>;

/** How many stale rows one pass will embed. A guard against an unbounded backfill in a serverless request. */
const MAX_EMBEDS_PER_PASS = 300;

export interface IndexResult {
  chunks: number;
  embedded: number;
  /** Set when chunking succeeded but embedding didn't — the index is usable, just keyword-only. */
  embeddingError?: string;
}

/**
 * Rebuilds a project's chunks from its current segments, then embeds whatever
 * is stale.
 *
 * Chunks are derived data, so this replaces rather than reconciles: cheaper
 * and simpler than diffing windows, and the only cost is re-embedding a
 * project's worth of text (fractions of a cent). Embedding failures are
 * deliberately not fatal — a transcript that is chunked but unembedded is
 * fully keyword-searchable, which is a far better outcome than a webhook that
 * marks the project failed because a third-party API had a bad minute.
 */
export async function reindexProject(supabase: Client, projectId: string): Promise<IndexResult> {
  const { data: project, error: projectError } = await supabase
    .from("tw_projects")
    .select("id, title, description, interview_date")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError || !project) {
    throw new Error(projectError?.message ?? "Project not found");
  }

  const [{ data: segments, error: segmentError }, { data: speakers, error: speakerError }] =
    await Promise.all([
      supabase
        .from("tw_segments")
        .select("start_ms, end_ms, text, speaker_id")
        .eq("project_id", projectId)
        .order("position"),
      supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .eq("project_id", projectId),
    ]);

  if (segmentError) throw new Error(segmentError.message);
  if (speakerError) throw new Error(speakerError.message);

  const chunks = buildChunks(
    (segments ?? []).map((row) => ({
      startMs: row.start_ms,
      endMs: row.end_ms,
      text: row.text,
      speakerId: row.speaker_id,
    })),
    (speakers ?? []).map((row) => ({
      id: row.id,
      diarizationLabel: row.diarization_label,
      displayName: row.display_name,
    })),
  );

  const { error: deleteError } = await supabase
    .from("tw_chunks")
    .delete()
    .eq("project_id", projectId);
  if (deleteError) throw new Error(deleteError.message);

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from("tw_chunks").insert(
      chunks.map((chunk) => ({
        project_id: projectId,
        start_ms: chunk.startMs,
        end_ms: chunk.endMs,
        text: chunk.text,
        stale: true,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  const embedded = await embedPending(supabase, projectId, {
    title: project.title,
    description: project.description,
    interviewDate: project.interview_date,
  });

  return { chunks: chunks.length, ...embedded };
}

/**
 * Embeds this project's stale chunks and clips. Safe to call repeatedly — it
 * is driven entirely by the `stale` / `embedding_stale` flags the migration's
 * triggers maintain, so a no-op costs two indexed reads.
 */
export async function embedPending(
  supabase: Client,
  projectId: string,
  context: ChunkProjectContext,
): Promise<{ embedded: number; embeddingError?: string }> {
  const provider = getEmbeddingProvider();
  if (!provider) return { embedded: 0 };

  try {
    const [{ data: staleChunks }, { data: staleClips }] = await Promise.all([
      supabase
        .from("tw_chunks")
        .select("id, text")
        .eq("project_id", projectId)
        .eq("stale", true)
        .limit(MAX_EMBEDS_PER_PASS),
      supabase
        .from("tw_clips")
        .select("id, title, excerpt")
        .eq("project_id", projectId)
        .eq("embedding_stale", true)
        .limit(MAX_EMBEDS_PER_PASS),
    ]);

    const chunkRows = staleChunks ?? [];
    const clipRows = staleClips ?? [];
    if (chunkRows.length === 0 && clipRows.length === 0) return { embedded: 0 };

    // One request covers both kinds — they share a model and a rate limit,
    // and splitting them would double the round trips for no benefit.
    const inputs = [
      ...chunkRows.map((row) => buildEmbeddingInput(context, row.text)),
      ...clipRows.map((row) =>
        buildClipEmbeddingInput(context, { title: row.title, excerpt: row.excerpt }),
      ),
    ];
    const vectors = await provider.embed(inputs);

    await Promise.all([
      ...chunkRows.map((row, index) =>
        supabase
          .from("tw_chunks")
          .update({ embedding: toVectorLiteral(vectors[index]!), stale: false })
          .eq("id", row.id),
      ),
      ...clipRows.map((row, index) =>
        supabase
          .from("tw_clips")
          .update({
            embedding: toVectorLiteral(vectors[chunkRows.length + index]!),
            embedding_stale: false,
          })
          .eq("id", row.id),
      ),
    ]);

    return { embedded: chunkRows.length + clipRows.length };
  } catch (error) {
    // Never fatal: see reindexProject's comment. Logged, reported to the
    // caller, and retried on the next pass — the rows stay flagged stale.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[transcription] embedding pass failed", { projectId, error: message });
    return { embedded: 0, embeddingError: message };
  }
}

/** Project context for the embedding header, read fresh so an edited background is picked up. */
export async function getProjectContext(
  supabase: Client,
  projectId: string,
): Promise<ChunkProjectContext | null> {
  const { data } = await supabase
    .from("tw_projects")
    .select("title, description, interview_date")
    .eq("id", projectId)
    .maybeSingle();

  return data
    ? { title: data.title, description: data.description, interviewDate: data.interview_date }
    : null;
}
