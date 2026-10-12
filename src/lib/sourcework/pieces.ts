// Pieces (docs/sourcework-analysis-design.md §6): pure logic for a piece's
// blocks — shape, validation, the edits the editor makes, and length. No
// "server-only": the editor computes length live with the same code the Pieces
// list and the server use, so the three can never disagree.

import { estimateReadSeconds } from "@/lib/log/read-time";
import { formatClock } from "@/lib/format";

export interface NarrationBlock {
  id: string;
  type: "narration";
  text: string;
  /**
   * "anchor": the anchor's lead-in to a reporter's recorded piece. It is read by someone else,
   * so it is not part of the piece's timed length. Absent means the piece itself.
   */
  role?: "anchor";
}

export interface ActualityBlock {
  id: string;
  type: "actuality";
  excerpt_id: string;
  /** This piece's own trim of the excerpt; absent means the excerpt's own point. */
  in_ms?: number;
  out_ms?: number;
  /**
   * Stretches of the (trimmed) range this piece leaves out, e.g. long pauses. Source time,
   * ascending, not overlapping. Absent means the clip plays straight through.
   */
  cuts?: Cut[];
}

/** A stretch of a source recording, in ms. */
export interface Cut {
  start_ms: number;
  end_ms: number;
}

export type PieceBlock = NarrationBlock | ActualityBlock;

/** What length needs to know about an excerpt. */
export interface ExcerptTiming {
  id: string;
  startMs: number;
  endMs: number;
}

export const MAX_NARRATION_CHARS = 5000;
export const MAX_BLOCKS = 200;
export const MIN_ACTUALITY_MS = 500;
export const MAX_CUTS = 200;
/** A cut shorter than this is not worth a seek in playback. */
export const MIN_CUT_MS = 100;
export const NUDGE_STEPS_MS = [-250, -50, 50, 250];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Reads a stored or client-sent body. Anything that is not exactly the block
 * shape is refused rather than repaired: a body is written by code, so a
 * surprise means a bug worth seeing, not noise to tolerate.
 */
export function parsePieceBody(value: unknown): PieceBlock[] | null {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS) return null;
  const seen = new Set<string>();
  const blocks: PieceBlock[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const raw = item as Record<string, unknown>;
    if (typeof raw.id !== "string" || !UUID.test(raw.id) || seen.has(raw.id)) return null;
    seen.add(raw.id);
    if (raw.type === "narration") {
      if (typeof raw.text !== "string" || raw.text.length > MAX_NARRATION_CHARS) return null;
      if (raw.role !== undefined && raw.role !== "anchor") return null;
      blocks.push({
        id: raw.id,
        type: "narration",
        text: raw.text,
        ...(raw.role === "anchor" ? { role: "anchor" as const } : {}),
      });
    } else if (raw.type === "actuality") {
      if (typeof raw.excerpt_id !== "string" || !UUID.test(raw.excerpt_id)) return null;
      const block: ActualityBlock = { id: raw.id, type: "actuality", excerpt_id: raw.excerpt_id };
      if (raw.in_ms !== undefined || raw.out_ms !== undefined) {
        if (!isNonNegativeInt(raw.in_ms) || !isNonNegativeInt(raw.out_ms)) return null;
        if (raw.out_ms - raw.in_ms < MIN_ACTUALITY_MS) return null;
        block.in_ms = raw.in_ms;
        block.out_ms = raw.out_ms;
      }
      if (raw.cuts !== undefined) {
        const cuts = parseCuts(raw.cuts);
        if (!cuts) return null;
        if (cuts.length > 0) block.cuts = cuts;
      }
      blocks.push(block);
    } else {
      return null;
    }
  }
  return blocks;
}

function parseCuts(value: unknown): Cut[] | null {
  if (!Array.isArray(value) || value.length > MAX_CUTS) return null;
  const cuts: Cut[] = [];
  let previousEnd = 0;
  for (const item of value) {
    if (typeof item !== "object" || item === null) return null;
    const raw = item as Record<string, unknown>;
    if (!isNonNegativeInt(raw.start_ms) || !isNonNegativeInt(raw.end_ms)) return null;
    // Ascending and apart: playback and length walk the list once.
    if (raw.end_ms <= raw.start_ms || raw.start_ms < previousEnd) return null;
    cuts.push({ start_ms: raw.start_ms, end_ms: raw.end_ms });
    previousEnd = raw.end_ms;
  }
  return cuts;
}

/**
 * The cuts that still apply to `range`: clipped to it, and dropped when what is left is too short
 * to matter. A trim that moves inside a cut shortens it rather than leaving it hanging outside.
 */
export function cutsWithin(
  cuts: readonly Cut[] | undefined,
  range: { startMs: number; endMs: number },
): Cut[] {
  if (!cuts) return [];
  const kept: Cut[] = [];
  for (const cut of cuts) {
    const start = Math.max(cut.start_ms, range.startMs);
    const end = Math.min(cut.end_ms, range.endMs);
    if (end - start >= MIN_CUT_MS) kept.push({ start_ms: start, end_ms: end });
  }
  return kept;
}

/** The ranges an actuality actually plays, with its cuts taken out of its range. */
export function playedSpans(
  range: { startMs: number; endMs: number },
  cuts: readonly Cut[] | undefined,
): { startMs: number; endMs: number }[] {
  const spans: { startMs: number; endMs: number }[] = [];
  let cursor = range.startMs;
  for (const cut of cutsWithin(cuts, range)) {
    if (cut.start_ms > cursor) spans.push({ startMs: cursor, endMs: cut.start_ms });
    cursor = cut.end_ms;
  }
  if (cursor < range.endMs) spans.push({ startMs: cursor, endMs: range.endMs });
  return spans;
}

/** Milliseconds an actuality plays: its range less its cuts. */
export function playedMs(
  range: { startMs: number; endMs: number },
  cuts: readonly Cut[] | undefined,
): number {
  return playedSpans(range, cuts).reduce((total, span) => total + span.endMs - span.startMs, 0);
}

export function newNarration(id: string, text = "", role?: "anchor"): NarrationBlock {
  return { id, type: "narration", text, ...(role ? { role } : {}) };
}

/** Marks a narration block as the anchor's lead-in, or puts it back in the piece. */
export function setNarrationRole(
  blocks: readonly PieceBlock[],
  id: string,
  role: "anchor" | undefined,
): PieceBlock[] {
  return blocks.map((block) => {
    if (block.id !== id || block.type !== "narration") return block;
    const rest: NarrationBlock = { id: block.id, type: "narration", text: block.text };
    return role ? { ...rest, role } : rest;
  });
}

export function newActuality(id: string, excerptId: string): ActualityBlock {
  return { id, type: "actuality", excerpt_id: excerptId };
}

/** The range an actuality plays: its own trim, else the excerpt's. Null when the excerpt is gone. */
export function actualityRange(
  block: ActualityBlock,
  excerpt: ExcerptTiming | undefined,
): { startMs: number; endMs: number } | null {
  if (!excerpt) return null;
  return {
    startMs: block.in_ms ?? excerpt.startMs,
    endMs: block.out_ms ?? excerpt.endMs,
  };
}

/** Whole seconds a block takes; narration by read time (160 wpm), an actuality by its range. */
export function blockSeconds(
  block: PieceBlock,
  excerptsById: ReadonlyMap<string, ExcerptTiming>,
): number {
  if (block.type === "narration") return estimateReadSeconds(block.text) ?? 0;
  const range = actualityRange(block, excerptsById.get(block.excerpt_id));
  return range ? Math.max(0, Math.round(playedMs(range, block.cuts) / 1000)) : 0;
}

export interface PieceLength {
  totalSeconds: number;
  /** The reporter's words in the piece; an anchor intro is not in here. */
  narrationSeconds: number;
  actualitySeconds: number;
  /** The anchor's lead-in, kept out of totalSeconds (the piece's timed length). */
  anchorSeconds: number;
  perBlock: Map<string, number>;
}

export function computePieceLength(
  blocks: readonly PieceBlock[],
  excerpts: readonly ExcerptTiming[],
): PieceLength {
  const byId = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));
  const perBlock = new Map<string, number>();
  let narrationSeconds = 0;
  let actualitySeconds = 0;
  let anchorSeconds = 0;
  for (const block of blocks) {
    const seconds = blockSeconds(block, byId);
    perBlock.set(block.id, seconds);
    if (block.type === "narration" && block.role === "anchor") anchorSeconds += seconds;
    else if (block.type === "narration") narrationSeconds += seconds;
    else actualitySeconds += seconds;
  }
  return {
    totalSeconds: narrationSeconds + actualitySeconds,
    narrationSeconds,
    actualitySeconds,
    anchorSeconds,
    perBlock,
  };
}

/** "3s under", "on target", "12s over"; null with no target. */
export function describeAgainstTarget(
  totalSeconds: number,
  targetSeconds: number | null,
): string | null {
  if (targetSeconds === null) return null;
  const diff = targetSeconds - totalSeconds;
  if (diff === 0) return "on target";
  const size = Math.abs(diff);
  const amount = size >= 60 ? formatClock(size) : `${size}s`;
  return diff > 0 ? `${amount} under` : `${amount} over`;
}

/** "1:00", "90" (seconds), "2m", "1m30" → seconds; null if it is not a usable length. */
export function parseTargetInput(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  let seconds: number | null = null;
  let match = /^(\d{1,3}):([0-5]\d)$/.exec(text);
  if (match) seconds = Number(match[1]) * 60 + Number(match[2]);
  else if ((match = /^(\d{1,4})$/.exec(text))) seconds = Number(match[1]);
  else if ((match = /^(\d{1,3})\s*m(?:in)?(?:\s*(\d{1,2})\s*s?)?$/.exec(text))) {
    seconds = Number(match[1]) * 60 + Number(match[2] ?? 0);
  }
  if (seconds === null || seconds < 1 || seconds > 7200) return null;
  return seconds;
}

// Edits -----------------------------------------------------------------------
// Each returns a new array; the editor never mutates blocks in place.

/** Inserts at `index` (0 = before the first block, blocks.length = after the last). */
export function insertBlockAt(
  blocks: readonly PieceBlock[],
  index: number,
  block: PieceBlock,
): PieceBlock[] {
  const at = Math.min(Math.max(index, 0), blocks.length);
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
}

export function removeBlock(blocks: readonly PieceBlock[], id: string): PieceBlock[] {
  return blocks.filter((block) => block.id !== id);
}

/** Moves one block up (-1) or down (+1); unchanged at either end. */
export function moveBlock(blocks: readonly PieceBlock[], id: string, delta: -1 | 1): PieceBlock[] {
  const from = blocks.findIndex((block) => block.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= blocks.length) return [...blocks];
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Drag-and-drop: puts `id` where `overId` is. */
export function moveBlockTo(
  blocks: readonly PieceBlock[],
  id: string,
  overId: string,
): PieceBlock[] {
  const from = blocks.findIndex((block) => block.id === id);
  const to = blocks.findIndex((block) => block.id === overId);
  if (from < 0 || to < 0 || from === to) return [...blocks];
  const next = [...blocks];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export function setNarrationText(
  blocks: readonly PieceBlock[],
  id: string,
  text: string,
): PieceBlock[] {
  return blocks.map((block) =>
    block.id === id && block.type === "narration" ? { ...block, text } : block,
  );
}

export function swapExcerpt(
  blocks: readonly PieceBlock[],
  id: string,
  excerptId: string,
): PieceBlock[] {
  // A swap is a different clip, so the old trim does not carry over.
  return blocks.map((block) =>
    block.id === id && block.type === "actuality"
      ? { id: block.id, type: "actuality", excerpt_id: excerptId }
      : block,
  );
}

/**
 * Sets (or with `null` clears) an actuality's own trim, clamped to the source's
 * length. A trim equal to the excerpt's own points is stored as no trim at all,
 * so "Only in this piece" never records a no-op.
 */
export function setActualityTrim(
  blocks: readonly PieceBlock[],
  id: string,
  excerpt: ExcerptTiming,
  trim: { inMs: number; outMs: number } | null,
  sourceDurationMs: number | null,
): PieceBlock[] {
  return blocks.map((block) => {
    if (block.id !== id || block.type !== "actuality") return block;
    const bare = (range: { startMs: number; endMs: number }): ActualityBlock => {
      const cuts = cutsWithin(block.cuts, range);
      return {
        id: block.id,
        type: "actuality",
        excerpt_id: block.excerpt_id,
        ...(cuts.length > 0 ? { cuts } : {}),
      };
    };
    const own = { startMs: excerpt.startMs, endMs: excerpt.endMs };
    if (!trim) return bare(own);
    const clamped = clampTrim(trim.inMs, trim.outMs, sourceDurationMs);
    const range = { startMs: clamped.inMs, endMs: clamped.outMs };
    if (clamped.inMs === excerpt.startMs && clamped.outMs === excerpt.endMs) return bare(own);
    return { ...bare(range), in_ms: clamped.inMs, out_ms: clamped.outMs };
  });
}

/**
 * Sets (or with an empty list clears) the stretches an actuality leaves out. Cuts are clipped to
 * the block's current range, so a stale list can't reach outside it.
 */
export function setActualityCuts(
  blocks: readonly PieceBlock[],
  id: string,
  excerpt: ExcerptTiming,
  cuts: readonly Cut[],
): PieceBlock[] {
  return blocks.map((block) => {
    if (block.id !== id || block.type !== "actuality") return block;
    const { cuts: _previous, ...rest } = block;
    void _previous;
    const range = actualityRange(block, excerpt);
    const next = range ? cutsWithin(cuts, range) : [];
    return next.length > 0 ? { ...rest, cuts: next } : rest;
  });
}

/** The same clamp updateClipTrim applies to an excerpt: inside the source, at least MIN_ACTUALITY_MS long. */
export function clampTrim(
  inMs: number,
  outMs: number,
  sourceDurationMs: number | null,
): { inMs: number; outMs: number } {
  const upper = sourceDurationMs ?? Number.MAX_SAFE_INTEGER;
  const start = Math.max(0, Math.min(Math.round(inMs), upper - MIN_ACTUALITY_MS));
  const end = Math.min(upper, Math.max(Math.round(outMs), start + MIN_ACTUALITY_MS));
  return { inMs: start, outMs: end };
}

export function excerptIdsIn(blocks: readonly PieceBlock[]): string[] {
  return [
    ...new Set(blocks.flatMap((block) => (block.type === "actuality" ? [block.excerpt_id] : []))),
  ];
}

/** "Copy as text": narration as written, each actuality as speaker-less quoted words with its length. */
export function pieceAsText(
  title: string,
  blocks: readonly PieceBlock[],
  actualityText: (block: ActualityBlock) => { text: string; speaker: string | null } | null,
  length: PieceLength,
): string {
  const lines: string[] = [title, ""];
  for (const block of blocks) {
    if (block.type === "narration") {
      if (block.text.trim()) {
        lines.push(
          block.role === "anchor" ? `[ANCHOR INTRO] ${block.text.trim()}` : block.text.trim(),
          "",
        );
      }
      continue;
    }
    const found = actualityText(block);
    const seconds = formatClock(length.perBlock.get(block.id) ?? 0);
    lines.push(
      found
        ? `[ACTUALITY ${seconds}${found.speaker ? ` · ${found.speaker}` : ""}] “${found.text}”`
        : `[ACTUALITY ${seconds}] (excerpt no longer available)`,
      "",
    );
  }
  lines.push(`TRT ${formatClock(length.totalSeconds)}`);
  return `${lines.join("\n")}\n`;
}

// The assistant's changes ---------------------------------------------------------
// Blocks the assistant changed carry "Edited by the assistant · Undo" until the next
// person edit (§6.4). Which ones is derived, not stored: the current blocks against the
// last version a person or a draft saved.

/** A block's state before the assistant's edits: the old block, or null when the assistant added it. */
export type AssistantChanges = Record<string, PieceBlock | null>;

function sameBlock(a: PieceBlock, b: PieceBlock): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function diffAssistantChanges(
  base: readonly PieceBlock[],
  current: readonly PieceBlock[],
): AssistantChanges {
  const before = new Map(base.map((block) => [block.id, block]));
  const changes: AssistantChanges = {};
  for (const block of current) {
    const old = before.get(block.id);
    if (!old) changes[block.id] = null;
    else if (!sameBlock(old, block)) changes[block.id] = old;
  }
  return changes;
}

/** Undo on one marked block: put it back as it was, or take it out if the assistant added it. */
export function undoAssistantChange(
  blocks: readonly PieceBlock[],
  id: string,
  previous: PieceBlock | null,
): PieceBlock[] {
  if (previous === null) return removeBlock(blocks, id);
  return blocks.map((block) => (block.id === id ? previous : block));
}
