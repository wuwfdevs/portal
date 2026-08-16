import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getPrimarySourceForProject } from "@/lib/transcription/projects";
import {
  buildChunks,
  buildDocumentChunks,
  buildEmbeddingInput,
  buildClipEmbeddingInput,
  type ChunkProjectContext,
} from "./chunking";
import { getEmbeddingProvider, toVectorLiteral } from "./embeddings";

// Keeps the search index in step with the transcript. Called from three
// places: the ASR webhook (fresh transcript), the reindex action (backfill,
// and re-embedding after edits settle), and clip writes.
//
// Chunks are keyed by representation_id (a transcript is one representation
// of a source) and excerpts by source_id — see docs/sourcework-design.md.
// Most callers only know a projectId, though, so the project-scoped
// functions below resolve the project's (one, today) source/representation
// first and delegate to the representation-scoped ones.

type Client = SupabaseClient<Database>;

/** How many stale rows one pass will embed. A guard against an unbounded backfill in a serverless request. */
const MAX_EMBEDS_PER_PASS = 300;

export interface IndexResult {
  chunks: number;
  embedded: number;
  /** Set when chunking succeeded but embedding didn't — the index is usable, just keyword-only. */
  embeddingError?: string;
}

interface EmbeddingContext {
  representationId: string;
  sourceId: string;
  kind: Database["public"]["Enums"]["sw_representation_kind"];
  projectContext: ChunkProjectContext;
}

/**
 * The embedding-header context for a representation: the source's own
 * interview date (a fact about the recording) plus the title/description of
 * whichever project references that source — the first, in every case this
 * ships with, since a source is only ever referenced by a second project
 * once the "reference an existing source" UI exists (see
 * docs/sourcework-design.md).
 */
async function resolveEmbeddingContext(
  supabase: Client,
  representationId: string,
): Promise<EmbeddingContext | null> {
  const { data: representation, error: representationError } = await supabase
    .from("sw_representations")
    .select("id, source_id, kind")
    .eq("id", representationId)
    .maybeSingle();
  if (representationError) throw new Error(representationError.message);
  if (!representation) return null;

  const { data: source, error: sourceError } = await supabase
    .from("sw_sources")
    .select("interview_date")
    .eq("id", representation.source_id)
    .maybeSingle();
  if (sourceError) throw new Error(sourceError.message);

  const { data: link } = await supabase
    .from("sw_project_sources")
    .select("project_id")
    .eq("source_id", representation.source_id)
    .order("added_at")
    .limit(1)
    .maybeSingle();

  let project: { title: string; description: string | null } | null = null;
  if (link) {
    const { data, error } = await supabase
      .from("tw_projects")
      .select("title, description")
      .eq("id", link.project_id)
      .maybeSingle();
    if (!error) project = data;
  }

  return {
    representationId: representation.id,
    sourceId: representation.source_id,
    kind: representation.kind,
    projectContext: {
      title: project?.title ?? "",
      description: project?.description ?? null,
      interviewDate: source?.interview_date ?? null,
    },
  };
}

/**
 * Rebuilds a representation's chunks from its current content, then embeds
 * whatever is stale (both the representation's chunks and its source's
 * excerpts). Branches on the representation's kind (docs/sourcework-design.md
 * §8.8): a transcript chunks its segments into time-windowed retrieval
 * units (unchanged since Phase 5); a document_text representation chunks
 * its blocks into character-windowed ones instead. Both write into the same
 * tw_chunks table.
 *
 * Chunks are derived data, so this replaces rather than reconciles: cheaper
 * and simpler than diffing windows, and the only cost is re-embedding a
 * representation's worth of text (fractions of a cent). Embedding failures
 * are deliberately not fatal — a transcript or document that is chunked but
 * unembedded is fully keyword-searchable, which is a far better outcome
 * than a webhook that marks the representation failed because a third-party
 * API had a bad minute.
 */
export async function reindexRepresentation(
  supabase: Client,
  representationId: string,
): Promise<IndexResult> {
  const context = await resolveEmbeddingContext(supabase, representationId);
  if (!context) throw new Error("Representation not found");

  const { error: deleteError } = await supabase
    .from("tw_chunks")
    .delete()
    .eq("representation_id", representationId);
  if (deleteError) throw new Error(deleteError.message);

  const chunkCount =
    context.kind === "document_text"
      ? await insertDocumentChunks(supabase, representationId)
      : await insertTranscriptChunks(supabase, representationId);

  const embedded = await embedPending(supabase, context);
  return { chunks: chunkCount, ...embedded };
}

async function insertTranscriptChunks(supabase: Client, representationId: string): Promise<number> {
  const [{ data: segments, error: segmentError }, { data: speakers, error: speakerError }] =
    await Promise.all([
      supabase
        .from("tw_segments")
        .select("start_ms, end_ms, text, speaker_id")
        .eq("representation_id", representationId)
        .order("position"),
      supabase
        .from("tw_speakers")
        .select("id, diarization_label, display_name")
        .eq("representation_id", representationId),
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

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from("tw_chunks").insert(
      chunks.map((chunk) => ({
        representation_id: representationId,
        start_ms: chunk.startMs,
        end_ms: chunk.endMs,
        text: chunk.text,
        stale: true,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  return chunks.length;
}

async function insertDocumentChunks(supabase: Client, representationId: string): Promise<number> {
  const { data: blocks, error: blockError } = await supabase
    .from("sw_document_blocks")
    .select("id, page_number, reading_order, text")
    .eq("representation_id", representationId)
    .order("reading_order");
  if (blockError) throw new Error(blockError.message);

  const chunks = buildDocumentChunks(
    (blocks ?? []).map((row) => ({
      id: row.id,
      pageNumber: row.page_number,
      readingOrder: row.reading_order,
      text: row.text,
    })),
  );

  if (chunks.length > 0) {
    const { error: insertError } = await supabase.from("tw_chunks").insert(
      chunks.map((chunk) => ({
        representation_id: representationId,
        page_start: chunk.pageStart,
        page_end: chunk.pageEnd,
        anchor_block_id: chunk.anchorBlockId,
        text: chunk.text,
        stale: true,
      })),
    );
    if (insertError) throw new Error(insertError.message);
  }

  return chunks.length;
}

/** Same as reindexRepresentation, for callers that only have a project id. */
export async function reindexProject(supabase: Client, projectId: string): Promise<IndexResult> {
  const ref = await getPrimarySourceForProject(supabase, projectId);
  if (!ref?.representationId) throw new Error("This project has no transcript yet.");
  return reindexRepresentation(supabase, ref.representationId);
}

/**
 * Embeds a representation's stale chunks and its source's stale excerpts.
 * Safe to call repeatedly — it is driven entirely by the `stale` /
 * `embedding_stale` flags the migration's triggers maintain, so a no-op
 * costs two indexed reads.
 */
export async function embedPending(
  supabase: Client,
  context: EmbeddingContext,
): Promise<{ embedded: number; embeddingError?: string }> {
  const provider = getEmbeddingProvider();
  if (!provider) return { embedded: 0 };

  try {
    const [{ data: staleChunks }, { data: staleClips }] = await Promise.all([
      supabase
        .from("tw_chunks")
        .select("id, text")
        .eq("representation_id", context.representationId)
        .eq("stale", true)
        .limit(MAX_EMBEDS_PER_PASS),
      supabase
        .from("sw_source_excerpts")
        .select("id, title, excerpt_text")
        .eq("source_id", context.sourceId)
        .eq("embedding_stale", true)
        .limit(MAX_EMBEDS_PER_PASS),
    ]);

    const chunkRows = staleChunks ?? [];
    const clipRows = staleClips ?? [];
    if (chunkRows.length === 0 && clipRows.length === 0) return { embedded: 0 };

    // One request covers both kinds — they share a model and a rate limit,
    // and splitting them would double the round trips for no benefit.
    const inputs = [
      ...chunkRows.map((row) => buildEmbeddingInput(context.projectContext, row.text)),
      ...clipRows.map((row) =>
        buildClipEmbeddingInput(context.projectContext, { title: row.title, excerpt: row.excerpt_text }),
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
          .from("sw_source_excerpts")
          .update({
            embedding: toVectorLiteral(vectors[chunkRows.length + index]!),
            embedding_stale: false,
          })
          .eq("id", row.id),
      ),
    ]);

    return { embedded: chunkRows.length + clipRows.length };
  } catch (error) {
    // Never fatal: see reindexRepresentation's comment. Logged, reported to
    // the caller, and retried on the next pass — the rows stay flagged stale.
    const message = error instanceof Error ? error.message : String(error);
    console.error("[transcription] embedding pass failed", {
      representationId: context.representationId,
      error: message,
    });
    return { embedded: 0, embeddingError: message };
  }
}

/**
 * Best-effort re-embed for a project's transcript and excerpts after an edit.
 * Never throws: the rows stay flagged stale, so the next reindex or edit
 * picks them up, and in the meantime the stale embedding still points at
 * substantially the same passage (design doc §6, "staleness over eagerness").
 * Replaces what used to be duplicated as a private helper in both
 * transcription/actions.ts and [id]/clip-actions.ts.
 */
export async function embedPendingForProject(supabase: Client, projectId: string): Promise<void> {
  try {
    const ref = await getPrimarySourceForProject(supabase, projectId);
    if (!ref?.representationId) return;
    const context = await resolveEmbeddingContext(supabase, ref.representationId);
    if (context) await embedPending(supabase, context);
  } catch (error) {
    console.error("[transcription] re-embed after edit failed", { projectId, error });
  }
}

/**
 * Embeds a project's stale data points (Sourcework Phase 4 —
 * docs/sourcework-design.md §9.7). Deliberately separate from embedPending
 * above rather than folded into it: every existing pass in this module is
 * keyed by sourceId, but a data point is project-scoped and its evidence can
 * legitimately span more than one of a project's sources (§9.3), so there's
 * no single source to key this pass off of. Same shape otherwise —
 * stale-flag-driven, MAX_EMBEDS_PER_PASS capped, swallows its own errors.
 */
export async function embedPendingDataPoints(
  supabase: Client,
  projectId: string,
): Promise<{ embedded: number; embeddingError?: string }> {
  const provider = getEmbeddingProvider();
  if (!provider) return { embedded: 0 };

  try {
    const { data: staleDataPoints } = await supabase
      .from("sw_data_points")
      .select("id, summary")
      .eq("project_id", projectId)
      .eq("embedding_stale", true)
      .limit(MAX_EMBEDS_PER_PASS);

    const rows = staleDataPoints ?? [];
    if (rows.length === 0) return { embedded: 0 };

    const { data: project } = await supabase
      .from("tw_projects")
      .select("title, description")
      .eq("id", projectId)
      .maybeSingle();
    // No single interviewDate: a data point's evidence can span more than
    // one source, each with its own — see §9.3. The heading falls back to
    // just the project title/description, same as buildEmbeddingInput
    // already does when interviewDate is absent.
    const projectContext: ChunkProjectContext = {
      title: project?.title ?? "",
      interviewDate: null,
      description: project?.description ?? null,
    };

    const inputs = rows.map((row) => buildEmbeddingInput(projectContext, row.summary));
    const vectors = await provider.embed(inputs);

    await Promise.all(
      rows.map((row, index) =>
        supabase
          .from("sw_data_points")
          .update({ embedding: toVectorLiteral(vectors[index]!), embedding_stale: false })
          .eq("id", row.id),
      ),
    );

    return { embedded: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[transcription] data point embedding pass failed", {
      projectId,
      error: message,
    });
    return { embedded: 0, embeddingError: message };
  }
}

/**
 * Best-effort re-embed for one representation and its source's excerpts —
 * for callers that already know which representation they just wrote to.
 * Unlike embedPendingForProject, this never guesses "the project's primary
 * source": that guess re-embeds the wrong representation whenever the write
 * landed on a project's non-primary source (or a source reached directly,
 * outside any one project, via Source Detail).
 */
export async function embedPendingForRepresentation(
  supabase: Client,
  representationId: string,
): Promise<void> {
  try {
    const context = await resolveEmbeddingContext(supabase, representationId);
    if (context) await embedPending(supabase, context);
  } catch (error) {
    console.error("[transcription] re-embed after edit failed", { representationId, error });
  }
}
