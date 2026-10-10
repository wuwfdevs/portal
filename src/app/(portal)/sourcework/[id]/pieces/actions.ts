"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { assertToolAccess } from "@/lib/auth/authz";
import { failWith } from "@/lib/editorial/action-result";
import { actionError, actionOk, type ActionResult } from "@/lib/action-response";
import { field } from "@/lib/form-fields";
import { getDisplayNames } from "@/lib/profile-names";
import { getSignedMediaUrl } from "@/lib/transcription/storage";
import { piecePath, projectPath } from "@/lib/transcription/links";
import { parsePieceBody, type PieceBlock } from "@/lib/sourcework/pieces";
import { savePieceBlocks, type SavedVia } from "@/lib/sourcework/piece-writes";
import { loadPieceExcerpts, loadSegmentsAround } from "@/lib/sourcework/piece-queries";
import type { TextSegment } from "@/lib/sourcework/piece-text";

// Pieces (docs/sourcework-analysis-design.md §6, Phase D). Same trust model as
// the rest of Sourcework: any tool member may build any project's piece.
// Actions the editor calls return ActionResult; createPiece is a <form action>.

const TITLE_MAX = 200;

function revalidatePieces(projectId: string, pieceId?: string) {
  revalidatePath(projectPath(projectId));
  if (pieceId) revalidatePath(piecePath(projectId, pieceId));
}

/** A new, blank piece. It opens straight into the editor (no form first). */
export async function createPiece(formData: FormData) {
  const { profile } = await assertToolAccess("transcription");
  const projectId = field(formData, "project_id");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sw_pieces")
    .insert({ project_id: projectId, created_by: profile.id })
    .select("id")
    .single();
  if (error || !data) {
    console.error("Could not create the piece:", error);
    failWith(projectPath(projectId, "pieces"), "Could not start a new piece. Please try again.");
  }
  revalidatePieces(projectId);
  redirect(piecePath(projectId, data.id));
}

export async function renamePiece(input: {
  pieceId: string;
  title: string;
}): Promise<ActionResult> {
  await assertToolAccess("transcription");
  const title = input.title.trim();
  if (!title) return actionError("Give the piece a title.");
  if (title.length > TITLE_MAX) return actionError("That title is too long.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_pieces")
    .update({ title })
    .eq("id", input.pieceId)
    .select("project_id")
    .maybeSingle();
  if (error) {
    console.error("Could not rename the piece:", error);
    return actionError("Could not rename the piece.");
  }
  if (!data) return actionError("That piece no longer exists.");
  revalidatePieces(data.project_id, input.pieceId);
  return actionOk();
}

export async function setPieceTarget(input: {
  pieceId: string;
  targetSeconds: number | null;
}): Promise<ActionResult> {
  await assertToolAccess("transcription");
  const target = input.targetSeconds;
  if (target !== null && (!Number.isInteger(target) || target < 1 || target > 7200)) {
    return actionError("That is not a usable length.");
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_pieces")
    .update({ target_seconds: target })
    .eq("id", input.pieceId)
    .select("project_id")
    .maybeSingle();
  if (error) {
    console.error("Could not set the piece's target:", error);
    return actionError("Could not save the target length.");
  }
  if (!data) return actionError("That piece no longer exists.");
  revalidatePieces(data.project_id, input.pieceId);
  return actionOk();
}

export async function deletePiece(pieceId: string): Promise<ActionResult> {
  await assertToolAccess("transcription");
  const supabase = await createClient();
  // The delete cascades to the piece's versions.
  const { data, error } = await supabase
    .from("sw_pieces")
    .delete()
    .eq("id", pieceId)
    .select("id, project_id");
  if (error) {
    console.error("Could not delete the piece:", error);
    return actionError("Could not delete the piece.");
  }
  if (!data || data.length === 0) {
    return actionError("That piece no longer exists, or you don't have permission to delete it.");
  }
  revalidatePieces(data[0]!.project_id);
  return actionOk();
}

/**
 * Saves the blocks as the next version, if the piece is still at the version
 * the editor started from. `conflict` means someone else saved first; the editor
 * offers a reload instead of overwriting them. Length and the excerpt list are
 * derived here from the blocks, never taken from the client.
 */
export async function savePieceBody(input: {
  pieceId: string;
  baseVersion: number;
  body: unknown;
}): Promise<
  ActionResult<{ version: number; lengthSeconds: number }> | { ok: false; conflict: true }
> {
  await assertToolAccess("transcription");
  const blocks = parsePieceBody(input.body);
  if (!blocks) return actionError("This piece could not be saved: its content is not valid.");

  const supabase = await createClient();
  return persistBody(supabase, input.pieceId, input.baseVersion, blocks, "person");
}

async function persistBody(
  supabase: Awaited<ReturnType<typeof createClient>>,
  pieceId: string,
  baseVersion: number,
  blocks: PieceBlock[],
  savedVia: SavedVia,
): Promise<
  ActionResult<{ version: number; lengthSeconds: number }> | { ok: false; conflict: true }
> {
  const saved = await savePieceBlocks(supabase, pieceId, baseVersion, blocks, savedVia);
  if (!saved.ok) return "conflict" in saved ? saved : actionError(saved.error);
  revalidatePieces(saved.projectId, pieceId);
  return actionOk({ version: saved.version, lengthSeconds: saved.lengthSeconds });
}

export interface PieceVersionRow {
  version: number;
  savedBy: string;
  savedVia: "person" | "assistant" | "generation";
  createdAt: string;
  current: boolean;
}

export async function listPieceVersions(
  pieceId: string,
): Promise<ActionResult<{ versions: PieceVersionRow[] }>> {
  await assertToolAccess("transcription");
  const supabase = await createClient();
  const [piece, versions] = await Promise.all([
    supabase.from("sw_pieces").select("current_version").eq("id", pieceId).maybeSingle(),
    supabase
      .from("sw_piece_versions")
      .select("version, saved_by, saved_via, created_at")
      .eq("piece_id", pieceId)
      .order("version", { ascending: false })
      .limit(100),
  ]);
  if (piece.error || versions.error) {
    console.error("Could not read the piece's history:", piece.error ?? versions.error);
    return actionError("Could not load the history.");
  }
  const rows = versions.data ?? [];
  const names = await getDisplayNames(
    rows.map((row) => row.saved_by),
    { degrade: true },
  );
  return actionOk({
    versions: rows.map((row) => ({
      version: row.version,
      savedBy: names.get(row.saved_by) ?? "Someone",
      savedVia: row.saved_via,
      createdAt: row.created_at,
      current: row.version === piece.data?.current_version,
    })),
  });
}

/** Restoring saves an old version again as the newest; nothing is rewritten. */
export async function restorePieceVersion(input: {
  pieceId: string;
  version: number;
  baseVersion: number;
}): Promise<
  ActionResult<{ version: number; blocks: PieceBlock[] }> | { ok: false; conflict: true }
> {
  await assertToolAccess("transcription");
  const supabase = await createClient();
  // Version 0 is the blank piece before its first save: undoing a draft written onto an
  // empty piece restores it.
  if (input.version === 0) {
    const saved = await persistBody(supabase, input.pieceId, input.baseVersion, [], "person");
    if (!saved.ok) return saved;
    return actionOk({ version: saved.version, blocks: [] });
  }
  const { data, error } = await supabase
    .from("sw_piece_versions")
    .select("body")
    .eq("piece_id", input.pieceId)
    .eq("version", input.version)
    .maybeSingle();
  if (error) {
    console.error("Could not read the version to restore:", error);
    return actionError("Could not restore that version.");
  }
  const blocks = parsePieceBody(data?.body);
  if (!blocks) return actionError("That version could not be read.");
  const saved = await persistBody(supabase, input.pieceId, input.baseVersion, blocks, "person");
  if (!saved.ok) return saved;
  return actionOk({ version: saved.version, blocks });
}

/** A fresh signed URL for a source's audio, asked for at the moment of play (a page left open outlives a URL baked in at render). */
export async function getPieceAudioUrl(sourceId: string): Promise<ActionResult<{ url: string }>> {
  await assertToolAccess("transcription");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sw_sources")
    .select("original_storage_path")
    .eq("id", sourceId)
    .maybeSingle();
  if (error) {
    console.error("Could not read the source to play:", error);
    return actionError("Could not load the audio.");
  }
  if (!data?.original_storage_path) return actionError("That recording isn't available.");
  const url = await getSignedMediaUrl(data.original_storage_path);
  return url ? actionOk({ url }) : actionError("Could not load the audio.");
}

/** Everything the trim panel needs for one clip: its transcript context and how many other pieces use it. */
export async function loadTrimContext(input: {
  pieceId: string;
  excerptId: string;
}): Promise<ActionResult<{ segments: TextSegment[]; otherPieces: number }>> {
  await assertToolAccess("transcription");
  const supabase = await createClient();
  const [excerpt] = await loadPieceExcerpts(supabase, [input.excerptId]);
  if (!excerpt) return actionError("That excerpt no longer exists.");

  const [segments, others] = await Promise.all([
    excerpt.representationId
      ? loadSegmentsAround(supabase, excerpt.representationId, excerpt.startMs, excerpt.endMs)
      : Promise.resolve([] as TextSegment[]),
    supabase
      .from("sw_pieces")
      .select("id", { count: "exact", head: true })
      .contains("excerpt_ids", [input.excerptId])
      .neq("id", input.pieceId),
  ]);
  if (others.error) {
    console.error("Could not count the pieces using this excerpt:", others.error);
    return actionError("Could not load the trim panel.");
  }
  return actionOk({ segments, otherPieces: others.count ?? 0 });
}
