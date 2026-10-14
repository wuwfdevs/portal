// Writing an outline out (docs/sourcework-analysis-design.md §22): what the model is given and what it may
// return when "Write from outline" meets a piece that has outline beats, and the pure step that puts the prose
// back into the piece. Pure.
//
// Code keeps the structure. The model returns narration for each beat by the beat's number and nothing
// else; this module replaces each beat with that narration at the same place, and leaves every other
// block (each actuality with its trim, any narration already written) exactly as it was. The model cannot
// reorder the piece, add a clip, drop a clip, or quote one.

import { collapseWhitespace } from "@/lib/text";
import { formatClock } from "@/lib/format";
import { READ_WORDS_PER_MINUTE } from "@/lib/log/read-time";
import {
  MAX_BLOCKS,
  MAX_NARRATION_CHARS,
  newNarration,
  type BeatBlock,
  type PieceBlock,
} from "./pieces";
import { WRITING_STANDARDS } from "./piece-standards";

/** Paragraphs the model may write for one beat; each becomes a narration block. */
export const MAX_PARAGRAPHS_PER_BEAT = 4;

export const EXPAND_FRAMING = `You write the narration for a radio piece a reporter has already outlined. You are given the reporter's direction (if any), the newsroom's format (if one is chosen), and the outline in order: beats, numbered, each saying what that part of the story has to do and the accepted findings that carry it; clips, which are the speaker's own voice and are placed already; and narration the reporter has already written.

Write each beat out as narration the reporter will read. Do not change the order, add a clip or drop one: the outline decides the shape and you only supply the words. Before a clip, name the speaker in the narration and set up what they are about to talk about without saying what they say; after it, do not repeat it. Never retype or paraphrase a clip's words. Do not repeat narration the reporter already wrote.

Write from the findings a beat cites, and only from them. A finding is a paraphrase, so attribute it. If a beat is marked to check, and its findings do not settle a figure, name, date or attribution it needs, write the sentence with its attribution and add a short bracketed placeholder such as [CHECK: who confirmed the death toll] rather than stating it as settled. A cited finding marked withdrawn is no longer accepted: do not use it. A beat marked as the anchor's lead-in is read by the anchor to introduce the reporter's piece; write it that way and do not give away the first line of the story.

${WRITING_STANDARDS}

Aim for the format's length: narration is read at about ${READ_WORDS_PER_MINUTE} words a minute, so add up the clips' lengths and size the narration to make up the rest. A beat can take one to four short paragraphs; a thin beat may take one sentence.

Return one entry per beat, by its number, with its paragraphs in order. The newsroom's guidance follows.`;

export interface ExpandCitedFinding {
  claim: string;
  speaker: string | null;
  sourceTitle: string;
  at: string | null;
  /** The finding was accepted when the outline was written and has been rejected or removed since. */
  withdrawn: boolean;
}

export type ExpandItem =
  | {
      kind: "beat";
      /** 1-based among the piece's beats, the number the model answers by. */
      number: number;
      text: string;
      verify: boolean;
      anchor: boolean;
      cited: readonly ExpandCitedFinding[];
    }
  | {
      kind: "actuality";
      speaker: string | null;
      sourceTitle: string;
      seconds: number;
      words: string;
      /** The excerpt was deleted; the clip plays nothing. */
      missing: boolean;
    }
  | { kind: "narration"; text: string; anchor: boolean };

export interface ExpandInputArgs {
  projectTitle: string;
  direction: string;
  formatGuide: string | null;
  targetSeconds: number | null;
  items: readonly ExpandItem[];
}

const CLIP_CHARS = 500;

export function buildExpandInput(args: ExpandInputArgs): string {
  const parts: string[] = [
    `Project: ${args.projectTitle}`,
    `Direction from the reporter:\n${args.direction.trim() ? args.direction.trim() : "None given."}`,
  ];
  if (args.formatGuide) parts.push(`Format:\n${args.formatGuide}`);
  if (args.targetSeconds !== null) parts.push(`Target length: ${formatClock(args.targetSeconds)}.`);

  const lines: string[] = [];
  for (const item of args.items) {
    if (item.kind === "narration") {
      lines.push(
        `NARRATION already written${item.anchor ? " (anchor lead-in)" : ""}: ${item.text}`,
      );
    } else if (item.kind === "actuality") {
      if (item.missing) {
        lines.push("CLIP (the excerpt is no longer available; write around it)");
      } else {
        const words =
          item.words.length > CLIP_CHARS ? `${item.words.slice(0, CLIP_CHARS)}…` : item.words;
        lines.push(
          `CLIP · ${formatClock(item.seconds)} · ${item.speaker ?? "speaker not named"} · ${item.sourceTitle}: “${words}”`,
        );
      }
    } else {
      lines.push(
        `BEAT ${item.number}${item.anchor ? " (anchor lead-in)" : ""}${item.verify ? " (check before stating as settled)" : ""}: ${item.text}`,
      );
      if (item.cited.length === 0) lines.push("  (no findings cited)");
      for (const finding of item.cited) {
        const who = [finding.speaker, finding.sourceTitle, finding.at ? `@${finding.at}` : null]
          .filter(Boolean)
          .join(", ");
        lines.push(
          finding.withdrawn
            ? "  - (withdrawn: no longer an accepted finding)"
            : `  - ${finding.claim} [${who}]`,
        );
      }
    }
  }
  parts.push(`The outline, in order:\n${lines.join("\n")}`);
  return parts.join("\n\n");
}

export function buildExpandOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["beats"],
    properties: {
      beats: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["beat_number", "paragraphs"],
          properties: {
            beat_number: { type: "integer" },
            paragraphs: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
}

export type ExpandResult =
  | {
      ok: true;
      blocks: PieceBlock[];
      /** Beats replaced by narration. */
      expanded: number;
      /** Beats the model left unwritten; they stay in the piece as beats. */
      skipped: number;
      warnings: string[];
    }
  | { ok: false; error: string };

/** The piece's beats, in order: the numbering the model is shown and answers by. */
export function numberedBeats(blocks: readonly PieceBlock[]): BeatBlock[] {
  return blocks.filter((block): block is BeatBlock => block.type === "beat");
}

/**
 * Replaces each beat the model wrote with narration at the same position, and keeps everything else.
 * A beat the model skipped, or wrote only blank paragraphs for, stays a beat. A beat number the piece
 * does not have is ignored; a number answered twice uses the first. An answer that writes nothing is
 * a failure.
 */
export function expandBeats(
  blocks: readonly PieceBlock[],
  text: string,
  newId: () => string,
): ExpandResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return {
      ok: false,
      error: "The narration came back in a shape that couldn't be read. Try again.",
    };
  }
  const entries = (raw as { beats?: unknown })?.beats;
  if (!Array.isArray(entries)) {
    return {
      ok: false,
      error: "The narration came back in a shape that couldn't be read. Try again.",
    };
  }

  const written = new Map<number, string[]>();
  let unknown = 0;
  const beatCount = numberedBeats(blocks).length;
  for (const entry of entries) {
    const row = (entry ?? {}) as { beat_number?: unknown; paragraphs?: unknown };
    const number = row.beat_number;
    if (
      typeof number !== "number" ||
      !Number.isInteger(number) ||
      number < 1 ||
      number > beatCount
    ) {
      unknown += 1;
      continue;
    }
    if (written.has(number)) continue;
    const paragraphs = (Array.isArray(row.paragraphs) ? row.paragraphs : [])
      .flatMap((paragraph) =>
        typeof paragraph === "string"
          ? [collapseWhitespace(paragraph).slice(0, MAX_NARRATION_CHARS)]
          : [],
      )
      .filter((paragraph) => paragraph !== "")
      .slice(0, MAX_PARAGRAPHS_PER_BEAT);
    if (paragraphs.length > 0) written.set(number, paragraphs);
  }

  const next: PieceBlock[] = [];
  let beatNumber = 0;
  let expanded = 0;
  let skipped = 0;
  let overLimit = false;
  let total = blocks.length;
  for (const block of blocks) {
    if (block.type !== "beat") {
      next.push(block);
      continue;
    }
    beatNumber += 1;
    const paragraphs = written.get(beatNumber);
    // A piece never grows past the block limit: a beat that would not fit stays an outline beat.
    if (!paragraphs || total - 1 + paragraphs.length > MAX_BLOCKS) {
      if (paragraphs) overLimit = true;
      next.push(block);
      skipped += 1;
      continue;
    }
    total += paragraphs.length - 1;
    expanded += 1;
    paragraphs.forEach((paragraph) =>
      next.push(newNarration(newId(), paragraph, block.role === "anchor" ? "anchor" : undefined)),
    );
  }

  if (expanded === 0) {
    return { ok: false, error: "The narration came back empty. Try again." };
  }
  const warnings: string[] = [];
  if (skipped > 0)
    warnings.push(
      `${skipped} beat${skipped === 1 ? " was" : "s were"} not written and ${skipped === 1 ? "stays" : "stay"} in the outline.`,
    );
  if (unknown > 0)
    warnings.push(
      `${unknown} beat number${unknown === 1 ? "" : "s"} the model named did not exist.`,
    );
  if (overLimit)
    warnings.push(`Some beats were left because the piece would pass ${MAX_BLOCKS} blocks.`);
  return { ok: true, blocks: next, expanded, skipped, warnings };
}
