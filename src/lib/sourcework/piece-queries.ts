import "server-only";
import { createClient } from "@/lib/supabase/server";
import { unwrapRead } from "@/lib/read-result";
import { likeTerm } from "@/lib/list-search";
import { parseWords } from "@/lib/transcription/transcript";
import { speakerDisplayLabel } from "@/lib/transcription/transcript";
import {
  diffAssistantChanges,
  excerptIdsIn,
  parsePieceBody,
  type AssistantChanges,
  type PieceBlock,
} from "./pieces";
import { describeFormatVersions } from "./piece-format-queries";
import type { TextSegment } from "./piece-text";

/** Words of context fetched either side of a trimmed clip, in ms. */
export const TRIM_CONTEXT_MS = 25_000;
const PICKER_LIMIT = 500;
/** Versions read back to find where the assistant's run of edits began. */
const ASSISTANT_LOOKBACK = 40;

/** An excerpt as the piece editor needs it: timing, where it came from, who says it. */
export interface PieceExcerpt {
  id: string;
  title: string;
  /** The words stored with the excerpt; the fallback until a trimmed range is read from the transcript. */
  text: string;
  startMs: number;
  endMs: number;
  sourceId: string;
  sourceTitle: string;
  sourceDurationMs: number | null;
  representationId: string | null;
  speaker: string | null;
}

export interface PieceListRow {
  id: string;
  title: string;
  lengthSeconds: number;
  targetSeconds: number | null;
  updatedAt: string;
  /** The format that drafted it, and whether anyone saved after the draft; null = written by hand. */
  madeWith: { formatName: string; edited: boolean } | null;
}

/** Where a piece's content came from, for its header and the note under it. */
export interface PieceOrigin {
  /** The format version that last drafted it. */
  format: { id: string; name: string; version: number } | null;
  /** Set when the latest version is that draft: "Drafted from Radio wrap v3 · Undo". */
  justDrafted: boolean;
}

export interface PieceDetail {
  id: string;
  projectId: string;
  projectTitle: string;
  title: string;
  targetSeconds: number | null;
  version: number;
  updatedAt: string;
  blocks: PieceBlock[];
  /** Every excerpt the blocks use that still exists. */
  excerpts: PieceExcerpt[];
  /** Transcript around each trimmed actuality, keyed by excerpt id. */
  segmentsByExcerpt: Record<string, TextSegment[]>;
  origin: PieceOrigin;
  /** Blocks the assistant changed since a person or a draft last saved (§6.4). */
  assistantChanges: AssistantChanges;
}

type Client = Awaited<ReturnType<typeof createClient>>;

/** A project's pieces, most recently touched first. A project holds a handful, so this is not paged. */
export async function listPiecesForProject(
  projectId: string,
  search?: string,
): Promise<PieceListRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("sw_pieces")
    .select(
      "id, title, length_seconds, target_seconds, updated_at, current_version, format_version_id, drafted_version",
    )
    .eq("project_id", projectId)
    .order("updated_at", { ascending: false })
    .order("id");
  const term = likeTerm(search);
  if (term) query = query.ilike("title", `%${term}%`);
  const rows = unwrapRead(await query, "this project's pieces") ?? [];
  const formats = await describeFormatVersions(
    rows.flatMap((row) => (row.format_version_id ? [row.format_version_id] : [])),
  );
  return rows.map((row) => {
    const format = row.format_version_id ? formats.get(row.format_version_id) : undefined;
    return {
      id: row.id,
      title: row.title,
      lengthSeconds: row.length_seconds,
      targetSeconds: row.target_seconds,
      updatedAt: row.updated_at,
      madeWith: format
        ? {
            formatName: format.name,
            edited: row.drafted_version !== null && row.current_version > row.drafted_version,
          }
        : null,
    };
  });
}

export async function countPieces(projectId: string): Promise<number> {
  const supabase = await createClient();
  const { count, error } = await supabase
    .from("sw_pieces")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId);
  if (error) throw new Error(`Could not load this project's pieces: ${error.message}`);
  return count ?? 0;
}

async function speakerLabels(supabase: Client, excerptIds: string[]): Promise<Map<string, string>> {
  if (excerptIds.length === 0) return new Map();
  const rows =
    unwrapRead(
      await supabase.rpc("sw_excerpt_speakers", { p_excerpt_ids: excerptIds }),
      "who speaks in these excerpts",
    ) ?? [];
  return new Map(
    rows.map((row) => [
      row.excerpt_id,
      speakerDisplayLabel(row.diarization_label, row.display_name),
    ]),
  );
}

/** Temporal excerpts by id, with source and speaker. Excerpts that no longer exist are simply absent. */
export async function loadPieceExcerpts(
  supabase: Client,
  excerptIds: string[],
): Promise<PieceExcerpt[]> {
  if (excerptIds.length === 0) return [];
  const excerpts =
    unwrapRead(
      await supabase
        .from("sw_source_excerpts")
        .select("id, source_id, representation_id, title, start_ms, end_ms, excerpt_text")
        .in("id", excerptIds)
        .eq("locator_kind", "temporal"),
      "these excerpts",
    ) ?? [];
  if (excerpts.length === 0) return [];

  const sourceIds = [...new Set(excerpts.map((excerpt) => excerpt.source_id))];
  const [sources, speakers] = await Promise.all([
    supabase.from("sw_sources").select("id, title, original_duration_ms").in("id", sourceIds),
    speakerLabels(
      supabase,
      excerpts.map((excerpt) => excerpt.id),
    ),
  ]);
  const sourceById = new Map(
    (unwrapRead(sources, "these excerpts' sources") ?? []).map((source) => [source.id, source]),
  );

  return excerpts.map((excerpt) => ({
    id: excerpt.id,
    title: excerpt.title,
    text: excerpt.excerpt_text,
    startMs: excerpt.start_ms!,
    endMs: excerpt.end_ms!,
    sourceId: excerpt.source_id,
    sourceTitle: sourceById.get(excerpt.source_id)?.title ?? "",
    sourceDurationMs: sourceById.get(excerpt.source_id)?.original_duration_ms ?? null,
    representationId: excerpt.representation_id,
    speaker: speakers.get(excerpt.id) ?? null,
  }));
}

/** The transcript lines overlapping a window of one representation. */
export async function loadSegmentsAround(
  supabase: Client,
  representationId: string,
  startMs: number,
  endMs: number,
): Promise<TextSegment[]> {
  const rows =
    unwrapRead(
      await supabase
        .from("tw_segments")
        .select("start_ms, end_ms, text, words")
        .eq("representation_id", representationId)
        .gt("end_ms", Math.max(0, startMs - TRIM_CONTEXT_MS))
        .lt("start_ms", endMs + TRIM_CONTEXT_MS)
        .order("position")
        .limit(400),
      "the transcript around this excerpt",
    ) ?? [];
  return rows.map((row) => ({
    startMs: row.start_ms,
    endMs: row.end_ms,
    text: row.text,
    words: parseWords(row.words),
  }));
}

/** Every temporal excerpt in a project, for the insert picker, newest first. */
export async function listPickerExcerpts(projectId: string): Promise<PieceExcerpt[]> {
  const supabase = await createClient();
  const links =
    unwrapRead(
      await supabase.from("sw_project_sources").select("source_id").eq("project_id", projectId),
      "this project's sources",
    ) ?? [];
  const sourceIds = links.map((link) => link.source_id);
  if (sourceIds.length === 0) return [];
  const rows =
    unwrapRead(
      await supabase
        .from("sw_source_excerpts")
        .select("id")
        .in("source_id", sourceIds)
        .eq("locator_kind", "temporal")
        .order("created_at", { ascending: false })
        .limit(PICKER_LIMIT),
      "this project's excerpts",
    ) ?? [];
  return loadPieceExcerpts(
    supabase,
    rows.map((row) => row.id),
  );
}

export async function getPieceDetail(pieceId: string): Promise<PieceDetail | null> {
  const supabase = await createClient();
  const piece = unwrapRead(
    await supabase
      .from("sw_pieces")
      .select(
        "id, project_id, title, target_seconds, current_version, updated_at, format_version_id, drafted_version",
      )
      .eq("id", pieceId)
      .maybeSingle(),
    "this piece",
  );
  if (!piece) return null;

  const [project, version, recent, formats] = await Promise.all([
    supabase.from("tw_projects").select("title").eq("id", piece.project_id).maybeSingle(),
    piece.current_version === 0
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from("sw_piece_versions")
          .select("body, saved_via")
          .eq("piece_id", pieceId)
          .eq("version", piece.current_version)
          .maybeSingle(),
    // Enough history to find the last version a person or a draft saved.
    piece.current_version === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase
          .from("sw_piece_versions")
          .select("version, saved_via")
          .eq("piece_id", pieceId)
          .order("version", { ascending: false })
          .limit(ASSISTANT_LOOKBACK),
    describeFormatVersions(piece.format_version_id ? [piece.format_version_id] : []),
  ]);
  const projectRow = unwrapRead(project, "this piece's project");
  const versionRow = unwrapRead(version, "this piece's content");
  const recentRows = unwrapRead(recent, "this piece's history") ?? [];

  let blocks: PieceBlock[] = [];
  if (piece.current_version > 0) {
    const parsed = parsePieceBody(versionRow?.body);
    if (!parsed) throw new Error("This piece's saved content could not be read.");
    blocks = parsed;
  }

  // The assistant's changes since the last version a person or a draft saved.
  let assistantChanges: AssistantChanges = {};
  if (versionRow?.saved_via === "assistant") {
    const base = recentRows.find((row) => row.saved_via !== "assistant");
    const oldest = recentRows[recentRows.length - 1];
    let baseBlocks: PieceBlock[] | null = null;
    if (base) {
      const baseRow = unwrapRead(
        await supabase
          .from("sw_piece_versions")
          .select("body")
          .eq("piece_id", pieceId)
          .eq("version", base.version)
          .maybeSingle(),
        "this piece's history",
      );
      baseBlocks = parsePieceBody(baseRow?.body);
    } else if (oldest?.version === 1) {
      // Every version so far is the assistant's: it started from a blank piece.
      baseBlocks = [];
    }
    if (baseBlocks) assistantChanges = diffAssistantChanges(baseBlocks, blocks);
  }
  const format = piece.format_version_id ? formats.get(piece.format_version_id) : undefined;

  const excerpts = await loadPieceExcerpts(supabase, excerptIdsIn(blocks));
  const excerptById = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));

  // Only a trimmed clip needs the transcript: its words are no longer the
  // excerpt's stored text, so they are read for the clip's own range.
  const segmentsByExcerpt: Record<string, TextSegment[]> = {};
  await Promise.all(
    blocks.map(async (block) => {
      if (block.type !== "actuality" || block.in_ms === undefined) return;
      const excerpt = excerptById.get(block.excerpt_id);
      if (!excerpt?.representationId || segmentsByExcerpt[excerpt.id]) return;
      segmentsByExcerpt[excerpt.id] = await loadSegmentsAround(
        supabase,
        excerpt.representationId,
        Math.min(block.in_ms, excerpt.startMs),
        Math.max(block.out_ms!, excerpt.endMs),
      );
    }),
  );

  return {
    id: piece.id,
    projectId: piece.project_id,
    projectTitle: projectRow?.title ?? "Project",
    title: piece.title,
    targetSeconds: piece.target_seconds,
    version: piece.current_version,
    updatedAt: piece.updated_at,
    blocks,
    excerpts,
    segmentsByExcerpt,
    origin: {
      format: format ? { id: format.formatId, name: format.name, version: format.version } : null,
      justDrafted:
        versionRow?.saved_via === "generation" && piece.drafted_version === piece.current_version,
    },
    assistantChanges,
  };
}
