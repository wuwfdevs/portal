import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { computePieceLength, excerptIdsIn, type PieceBlock } from "./pieces";
import { loadPieceExcerpts } from "./piece-queries";

// The one way a piece's content is saved (docs/sourcework-analysis-design.md §4.7), shared by
// the editor's autosave, History's restore, Draft with AI and the assistant's capabilities.
// Length and the excerpt list are derived here from the blocks, never taken from a caller, and
// every actuality must be an excerpt of one of the project's sources.

type Client = Awaited<ReturnType<typeof createClient>>;

export type SavedVia = "person" | "assistant" | "generation";

export type SavePieceResult =
  | { ok: true; version: number; lengthSeconds: number; projectId: string }
  | { ok: false; error: string }
  | { ok: false; conflict: true };

export async function savePieceBlocks(
  supabase: Client,
  pieceId: string,
  baseVersion: number,
  blocks: PieceBlock[],
  savedVia: SavedVia,
): Promise<SavePieceResult> {
  const { data: piece, error: pieceError } = await supabase
    .from("sw_pieces")
    .select("project_id")
    .eq("id", pieceId)
    .maybeSingle();
  if (pieceError) {
    console.error("Could not read the piece to save:", pieceError);
    return { ok: false, error: "Could not save the piece. Please try again." };
  }
  if (!piece) return { ok: false, error: "That piece no longer exists." };

  const ids = excerptIdsIn(blocks);
  const excerpts = await loadPieceExcerpts(supabase, ids);
  const { data: links, error: linkError } = await supabase
    .from("sw_project_sources")
    .select("source_id")
    .eq("project_id", piece.project_id);
  if (linkError) {
    console.error("Could not read the project's sources to save:", linkError);
    return { ok: false, error: "Could not save the piece. Please try again." };
  }
  const projectSources = new Set((links ?? []).map((link) => link.source_id));
  const knownIds = new Set(excerpts.map((excerpt) => excerpt.id));
  for (const excerpt of excerpts) {
    if (!projectSources.has(excerpt.sourceId)) {
      return { ok: false, error: "One of the excerpts isn't from this project's sources." };
    }
  }
  // An excerpt deleted since the editor loaded stays as a placeholder block
  // (length 0); it is not an error to keep saving around it.
  const length = computePieceLength(blocks, excerpts);

  const { data: version, error } = await supabase.rpc("sw_save_piece_version", {
    p_piece_id: pieceId,
    p_base_version: baseVersion,
    p_body: blocks,
    p_saved_via: savedVia,
    p_length_seconds: length.totalSeconds,
    p_excerpt_ids: ids.filter((id) => knownIds.has(id)),
  });
  if (error) {
    console.error("Could not save the piece:", error);
    return { ok: false, error: "Could not save the piece. Please try again." };
  }
  if (version === -1) return { ok: false, conflict: true };
  return {
    ok: true,
    version,
    lengthSeconds: length.totalSeconds,
    projectId: piece.project_id,
  };
}
