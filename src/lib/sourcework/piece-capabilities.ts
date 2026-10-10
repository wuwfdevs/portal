// The assistant's piece capabilities (docs/sourcework-analysis-design.md §6.4), registered in
// lib/capabilities/registry.ts under the `transcription` tool. Each edit reads the piece,
// changes it with the same pure functions the editor uses (lib/sourcework/pieces.ts), and saves
// the result as a new version marked `assistant` — so every edit is undoable from History and
// marked in the piece until a person edits it. No confirmation step: unlike recording an
// on-air outcome, nothing here is irreversible (§6.4).
//
// Two rules the shape enforces: an actuality is placed only by excerpt id, so the assistant
// can never alter what a speaker said; and every length it reports comes from the code the
// screen uses, never from the model's estimate.

import "server-only";
import { z } from "zod";
import { defineCapability, type CapabilityContext } from "@/lib/capabilities/define";
import { assertToolAccess } from "@/lib/auth/authz";
import { formatClock } from "@/lib/format";
import { piecePath } from "@/lib/transcription/links";
import {
  MAX_NARRATION_CHARS,
  actualityRange,
  clampTrim,
  computePieceLength,
  describeAgainstTarget,
  excerptIdsIn,
  insertBlockAt,
  moveBlock,
  newActuality,
  newNarration,
  parsePieceBody,
  removeBlock,
  setActualityTrim,
  setNarrationText,
  swapExcerpt,
  type PieceBlock,
} from "./pieces";
import { textForRange } from "./piece-text";
import { loadPieceExcerpts, loadSegmentsAround, type PieceExcerpt } from "./piece-queries";
import { savePieceBlocks } from "./piece-writes";
import { DIRECTION_MAX } from "./piece-draft-prompt";
import { describeFormat } from "./piece-formats";
import { listLiveFormats, describeFormatVersions } from "./piece-format-queries";
import { draftPiece } from "./piece-draft-run";

type Client = CapabilityContext["supabase"];

const TOOL = "transcription";
const uuid = z.string().uuid();

interface LoadedPiece {
  id: string;
  projectId: string;
  title: string;
  targetSeconds: number | null;
  version: number;
  formatVersionId: string | null;
  blocks: PieceBlock[];
  excerpts: Map<string, PieceExcerpt>;
}

async function loadPiece(supabase: Client, pieceId: string): Promise<LoadedPiece> {
  const { data: piece, error } = await supabase
    .from("sw_pieces")
    .select("id, project_id, title, target_seconds, current_version, format_version_id")
    .eq("id", pieceId)
    .maybeSingle();
  if (error) throw new Error("Could not read that piece.");
  if (!piece) throw new Error("That piece doesn't exist, or you can't open it.");

  let blocks: PieceBlock[] = [];
  if (piece.current_version > 0) {
    const { data: version, error: versionError } = await supabase
      .from("sw_piece_versions")
      .select("body")
      .eq("piece_id", pieceId)
      .eq("version", piece.current_version)
      .maybeSingle();
    if (versionError) throw new Error("Could not read that piece's content.");
    const parsed = parsePieceBody(version?.body);
    if (!parsed) throw new Error("That piece's saved content could not be read.");
    blocks = parsed;
  }
  const excerpts = await loadPieceExcerpts(supabase, excerptIdsIn(blocks));
  return {
    id: piece.id,
    projectId: piece.project_id,
    title: piece.title,
    targetSeconds: piece.target_seconds,
    version: piece.current_version,
    formatVersionId: piece.format_version_id,
    blocks,
    excerpts: new Map(excerpts.map((excerpt) => [excerpt.id, excerpt])),
  };
}

/** The piece as the assistant reads it: every block with its id, its length, and its words. */
async function describePiece(supabase: Client, piece: LoadedPiece) {
  const length = computePieceLength(piece.blocks, [...piece.excerpts.values()]);
  const formats = await describeFormatVersions(
    piece.formatVersionId ? [piece.formatVersionId] : [],
  );
  const format = piece.formatVersionId ? formats.get(piece.formatVersionId) : undefined;

  const blocks = await Promise.all(
    piece.blocks.map(async (block) => {
      const seconds = length.perBlock.get(block.id) ?? 0;
      if (block.type === "narration") {
        return { id: block.id, type: "narration", seconds, text: block.text };
      }
      const excerpt = piece.excerpts.get(block.excerpt_id);
      if (!excerpt) {
        return {
          id: block.id,
          type: "actuality",
          excerptId: block.excerpt_id,
          seconds: 0,
          missing: "This excerpt was deleted; the block is a placeholder.",
        };
      }
      const range = actualityRange(block, excerpt)!;
      let words = excerpt.text;
      if (block.in_ms !== undefined && excerpt.representationId) {
        const segments = await loadSegmentsAround(
          supabase,
          excerpt.representationId,
          range.startMs,
          range.endMs,
        );
        words = textForRange(segments, range.startMs, range.endMs) || words;
      }
      return {
        id: block.id,
        type: "actuality",
        excerptId: excerpt.id,
        excerptTitle: excerpt.title,
        speaker: excerpt.speaker,
        source: excerpt.sourceTitle,
        seconds,
        words,
        startMs: range.startMs,
        endMs: range.endMs,
        trimmedInThisPiece: block.in_ms !== undefined,
        sourceDurationMs: excerpt.sourceDurationMs,
      };
    }),
  );

  return {
    pieceId: piece.id,
    title: piece.title,
    url: piecePath(piece.projectId, piece.id),
    version: piece.version,
    length: formatClock(length.totalSeconds),
    lengthSeconds: length.totalSeconds,
    narration: formatClock(length.narrationSeconds),
    actualities: formatClock(length.actualitySeconds),
    target: piece.targetSeconds === null ? null : formatClock(piece.targetSeconds),
    againstTarget: describeAgainstTarget(length.totalSeconds, piece.targetSeconds),
    format: format ? `${format.name} v${format.version}` : null,
    blocks,
  };
}

/**
 * Reads the piece, applies `change`, saves the result as the assistant's version. One retry if
 * someone saved in between, re-applying the change to what they saved.
 */
async function editPiece(
  supabase: Client,
  pieceId: string,
  change: (piece: LoadedPiece) => Promise<PieceBlock[]> | PieceBlock[],
) {
  await assertToolAccess(TOOL);
  for (let attempt = 0; attempt < 2; attempt++) {
    const piece = await loadPiece(supabase, pieceId);
    const blocks = await change(piece);
    const saved = await savePieceBlocks(supabase, pieceId, piece.version, blocks, "assistant");
    if (saved.ok) {
      const after = await loadPiece(supabase, pieceId);
      return { saved: true, ...(await describePiece(supabase, after)) };
    }
    if (!("conflict" in saved)) throw new Error(saved.error);
  }
  throw new Error("Someone is editing this piece right now. Try again in a moment.");
}

function requireBlock(piece: LoadedPiece, blockId: string): PieceBlock {
  const block = piece.blocks.find((entry) => entry.id === blockId);
  if (!block) throw new Error(`There is no block ${blockId} in this piece. Read the piece again.`);
  return block;
}

/** An excerpt the piece may use: temporal, and from one of the project's sources (the save checks the second). */
async function requireExcerpt(supabase: Client, excerptId: string): Promise<PieceExcerpt> {
  const [excerpt] = await loadPieceExcerpts(supabase, [excerptId]);
  if (!excerpt) {
    throw new Error("No such excerpt in this project. Search the project's excerpts for its id.");
  }
  return excerpt;
}

/** Where "after this block" lands: null or absent = the very start. */
function insertIndex(piece: LoadedPiece, afterBlockId: string | null | undefined): number {
  if (!afterBlockId) return 0;
  requireBlock(piece, afterBlockId);
  return piece.blocks.findIndex((block) => block.id === afterBlockId) + 1;
}

const narrationText = z.string().trim().min(1).max(MAX_NARRATION_CHARS);

// Reading ---------------------------------------------------------------------------------

export const readPiece = defineCapability({
  id: "sourcework.piece.read",
  label: "read piece",
  summary:
    "Read a Sourcework piece: its title, target, length, format, and every block in order with its id, length and words. Read it before editing.",
  input: z.object({ pieceId: uuid }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    await assertToolAccess(TOOL);
    return describePiece(supabase, await loadPiece(supabase, input.pieceId));
  },
});

export const searchPieceExcerpts = defineCapability({
  id: "sourcework.piece.searchExcerpts",
  label: "search excerpts",
  summary:
    "Search the excerpts of a piece's project (or any project) by words, title, speaker or source. Returns each excerpt's id, words, speaker and length; place one in a piece by its id.",
  input: z.object({
    pieceId: uuid.optional(),
    projectId: uuid.optional(),
    query: z.string().trim().max(200).optional(),
  }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    await assertToolAccess(TOOL);
    let projectId = input.projectId;
    if (!projectId && input.pieceId)
      projectId = (await loadPiece(supabase, input.pieceId)).projectId;
    if (!projectId) throw new Error("Give a pieceId or a projectId.");

    const { data: links, error } = await supabase
      .from("sw_project_sources")
      .select("source_id")
      .eq("project_id", projectId);
    if (error) throw new Error("Could not read the project's sources.");
    const sourceIds = (links ?? []).map((link) => link.source_id);
    if (sourceIds.length === 0) return { excerpts: [] };
    const { data: rows, error: excerptError } = await supabase
      .from("sw_source_excerpts")
      .select("id")
      .in("source_id", sourceIds)
      .eq("locator_kind", "temporal")
      .order("created_at", { ascending: false })
      .limit(500);
    if (excerptError) throw new Error("Could not read the project's excerpts.");
    const excerpts = await loadPieceExcerpts(
      supabase,
      (rows ?? []).map((row) => row.id),
    );
    const terms = (input.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const matches = excerpts.filter((excerpt) => {
      if (terms.length === 0) return true;
      const haystack = [excerpt.title, excerpt.text, excerpt.speaker ?? "", excerpt.sourceTitle]
        .join(" ")
        .toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
    return {
      total: matches.length,
      excerpts: matches.slice(0, 25).map((excerpt) => ({
        excerptId: excerpt.id,
        title: excerpt.title,
        speaker: excerpt.speaker,
        source: excerpt.sourceTitle,
        seconds: Math.round((excerpt.endMs - excerpt.startMs) / 1000),
        words: excerpt.text,
      })),
    };
  },
});

export const listPieceFormats = defineCapability({
  id: "sourcework.piece.listFormats",
  label: "list formats",
  summary:
    "List the published piece formats a piece can be drafted from, with each one's length and actuality range.",
  input: z.object({}),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler() {
    await assertToolAccess(TOOL);
    const formats = await listLiveFormats();
    return {
      formats: formats.map((format) => ({
        formatId: format.id,
        name: format.name,
        version: format.version,
        shape: describeFormat(format.spec),
      })),
    };
  },
});

// Creating and drafting ----------------------------------------------------------------------

export const createPiece = defineCapability({
  id: "sourcework.piece.create",
  label: "create piece",
  writes: true,
  summary: "Create a new, blank piece in a Sourcework project. Returns its id and a link.",
  input: z.object({
    projectId: uuid,
    title: z.string().trim().min(1).max(200).optional(),
  }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    const { profile } = await assertToolAccess(TOOL);
    const { data, error } = await supabase
      .from("sw_pieces")
      .insert({
        project_id: input.projectId,
        created_by: profile.id,
        ...(input.title ? { title: input.title } : {}),
      })
      .select("id, title")
      .single();
    if (error || !data) throw new Error("Could not create the piece in that project.");
    return { pieceId: data.id, title: data.title, url: piecePath(input.projectId, data.id) };
  },
});

export const draftPieceFromFormat = defineCapability({
  id: "sourcework.piece.draftFromFormat",
  label: "draft from a format",
  writes: true,
  summary:
    "Draft a piece from a published format, from the project's accepted themes and excerpts. Replaces the piece's current blocks with the draft as a new version (the old content stays in History). Only do this when the person asks for a draft or to start over. Takes a minute or two.",
  input: z.object({
    pieceId: uuid,
    formatId: uuid,
    /** Leave out to use every accepted theme. */
    themeIds: z.array(uuid).max(40).optional(),
    direction: z.string().trim().max(DIRECTION_MAX).optional(),
  }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    const { profile } = await assertToolAccess(TOOL);
    const result = await draftPiece({
      pieceId: input.pieceId,
      formatId: input.formatId,
      themeIds: input.themeIds ?? null,
      direction: input.direction ?? "",
      userId: profile.id,
      savedVia: "generation",
    });
    if (!result.ok) throw new Error(result.error);
    return {
      drafted: true,
      from: `${result.formatName} v${result.formatVersion}`,
      warnings: result.warnings,
      ...(await describePiece(supabase, await loadPiece(supabase, input.pieceId))),
    };
  },
});

// Editing ---------------------------------------------------------------------------------------

export const replaceNarration = defineCapability({
  id: "sourcework.piece.replaceNarration",
  label: "replace narration",
  writes: true,
  summary: "Replace the text of one narration block in a piece.",
  input: z.object({ pieceId: uuid, blockId: uuid, text: narrationText }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    return editPiece(supabase, input.pieceId, (piece) => {
      const block = requireBlock(piece, input.blockId);
      if (block.type !== "narration") throw new Error("That block is an actuality, not narration.");
      return setNarrationText(piece.blocks, input.blockId, input.text);
    });
  },
});

export const insertNarration = defineCapability({
  id: "sourcework.piece.insertNarration",
  label: "add narration",
  writes: true,
  summary:
    "Add a narration block to a piece, after the given block (or at the start when afterBlockId is left out).",
  input: z.object({ pieceId: uuid, afterBlockId: uuid.nullable().optional(), text: narrationText }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    return editPiece(supabase, input.pieceId, (piece) =>
      insertBlockAt(
        piece.blocks,
        insertIndex(piece, input.afterBlockId),
        newNarration(crypto.randomUUID(), input.text),
      ),
    );
  },
});

export const placeActuality = defineCapability({
  id: "sourcework.piece.placeActuality",
  label: "place excerpt",
  writes: true,
  summary:
    "Place one of the project's excerpts in a piece as an actuality, by excerpt id, after the given block (or at the start). Its words always come from the transcript.",
  input: z.object({ pieceId: uuid, excerptId: uuid, afterBlockId: uuid.nullable().optional() }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    await requireExcerpt(supabase, input.excerptId);
    return editPiece(supabase, input.pieceId, (piece) =>
      insertBlockAt(
        piece.blocks,
        insertIndex(piece, input.afterBlockId),
        newActuality(crypto.randomUUID(), input.excerptId),
      ),
    );
  },
});

export const swapActuality = defineCapability({
  id: "sourcework.piece.swapExcerpt",
  label: "swap excerpt",
  writes: true,
  summary:
    "Swap the excerpt an actuality block plays for another of the project's excerpts, by id. Any trim is dropped.",
  input: z.object({ pieceId: uuid, blockId: uuid, excerptId: uuid }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    await requireExcerpt(supabase, input.excerptId);
    return editPiece(supabase, input.pieceId, (piece) => {
      const block = requireBlock(piece, input.blockId);
      if (block.type !== "actuality") throw new Error("That block is narration, not an actuality.");
      return swapExcerpt(piece.blocks, input.blockId, input.excerptId);
    });
  },
});

export const removePieceBlock = defineCapability({
  id: "sourcework.piece.removeBlock",
  label: "remove block",
  writes: true,
  summary: "Remove one block from a piece. An actuality's excerpt stays in the project.",
  input: z.object({ pieceId: uuid, blockId: uuid }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    return editPiece(supabase, input.pieceId, (piece) => {
      requireBlock(piece, input.blockId);
      return removeBlock(piece.blocks, input.blockId);
    });
  },
});

export const movePieceBlock = defineCapability({
  id: "sourcework.piece.moveBlock",
  label: "reorder",
  writes: true,
  summary:
    "Move one block in a piece so it sits right after another block, or first when afterBlockId is left out.",
  input: z.object({ pieceId: uuid, blockId: uuid, afterBlockId: uuid.nullable().optional() }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    return editPiece(supabase, input.pieceId, (piece) => {
      const block = requireBlock(piece, input.blockId);
      if (input.afterBlockId === input.blockId) return [...piece.blocks];
      const without = removeBlock(piece.blocks, input.blockId);
      if (!input.afterBlockId) return insertBlockAt(without, 0, block);
      requireBlock(piece, input.afterBlockId);
      const index = without.findIndex((entry) => entry.id === input.afterBlockId) + 1;
      return insertBlockAt(without, index, block);
    });
  },
});

export const nudgePieceBlock = defineCapability({
  id: "sourcework.piece.nudgeBlock",
  label: "reorder",
  writes: true,
  summary: "Move one block in a piece up or down by one place.",
  input: z.object({ pieceId: uuid, blockId: uuid, direction: z.enum(["up", "down"]) }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    return editPiece(supabase, input.pieceId, (piece) => {
      requireBlock(piece, input.blockId);
      return moveBlock(piece.blocks, input.blockId, input.direction === "up" ? -1 : 1);
    });
  },
});

export const trimActuality = defineCapability({
  id: "sourcework.piece.trimActuality",
  label: "trim",
  writes: true,
  summary:
    "Trim an actuality in this piece only, to a start and end in milliseconds of its source recording. The range may reach outside the excerpt into the surrounding audio; the excerpt itself is not changed. Pass reset: true to go back to the excerpt's own range.",
  input: z.object({
    pieceId: uuid,
    blockId: uuid,
    startMs: z.number().int().min(0).optional(),
    endMs: z.number().int().min(1).optional(),
    reset: z.boolean().optional(),
  }),
  requires: { tool: TOOL },
  confirmation: "none",
  async handler({ supabase }, input) {
    return editPiece(supabase, input.pieceId, (piece) => {
      const block = requireBlock(piece, input.blockId);
      if (block.type !== "actuality") throw new Error("Only an actuality can be trimmed.");
      const excerpt = piece.excerpts.get(block.excerpt_id);
      if (!excerpt)
        throw new Error("That actuality's excerpt was deleted, so it can't be trimmed.");
      if (input.reset)
        return setActualityTrim(piece.blocks, block.id, excerpt, null, excerpt.sourceDurationMs);
      if (
        input.startMs === undefined ||
        input.endMs === undefined ||
        input.endMs <= input.startMs
      ) {
        throw new Error("Give a startMs and a later endMs, or reset: true.");
      }
      const clamped = clampTrim(input.startMs, input.endMs, excerpt.sourceDurationMs);
      return setActualityTrim(
        piece.blocks,
        block.id,
        excerpt,
        { inMs: clamped.inMs, outMs: clamped.outMs },
        excerpt.sourceDurationMs,
      );
    });
  },
});
