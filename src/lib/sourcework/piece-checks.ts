// Advisory checks on a piece's structure (docs/sourcework-analysis-design.md §6.4). The
// assistant gets them with every read and every write, so it sees what a move, a removal or a
// rewrite left behind instead of having to notice it: a clip whose lead-in was moved away, a
// clip nothing introduces, a block that reads like a paragraph, a length outside the format's
// range. They are advice, never errors — a writer may want any of these — and they are code, so
// they do not depend on the model reading its own work carefully. Pure.

import { formatClock } from "@/lib/format";
import { countWords } from "@/lib/log/read-time";
import { actualityRangeLabel } from "./piece-formats";
import { computePieceLength, type ExcerptTiming, type PieceBlock } from "./pieces";

/** An actuality longer than this is long for radio (docs say clips usually run 8–20s). */
export const LONG_CLIP_SECONDS = 30;
/** A narration block longer than this reads as a paragraph, not a few sentences. */
export const LONG_NARRATION_WORDS = 75;
/** A short narration that names a speaker is read as that speaker's lead-in. */
export const LEAD_IN_MAX_WORDS = 40;

export interface CheckExcerpt extends ExcerptTiming {
  speaker: string | null;
}

export interface CheckGuardrails {
  targetSeconds: number | null;
  /** From the format; without it the length is not judged, only reported elsewhere. */
  toleranceSeconds?: number;
  minActualities?: number;
  maxActualities?: number;
}

export type PieceCheckCode =
  | "unintroduced_clip"
  | "orphan_lead_in"
  | "long_clip"
  | "long_narration"
  | "length"
  | "actuality_count"
  | "unresolved_placeholder";

export interface PieceCheck {
  code: PieceCheckCode;
  /** The block it is about; null for the piece as a whole. */
  blockId: string | null;
  message: string;
}

/** Labels that are not a name anyone would say in narration. */
const GENERIC_NAME_WORDS = new Set([
  "speaker",
  "unknown",
  "unnamed",
  "host",
  "interviewer",
  "reporter",
  "narrator",
]);

/** The words of a speaker's label that narration would use to name them; empty when they have no real name. */
export function speakerNameTokens(speaker: string | null): string[] {
  if (!speaker) return [];
  const words = speaker
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 3 && !GENERIC_NAME_WORDS.has(word));
  return [...new Set(words)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whether `text` names the speaker: any word of their label, as a whole word. */
export function mentionsSpeaker(text: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => new RegExp(`\\b${escapeRegExp(token)}\\b`, "i").test(text));
}

const CHECK_PLACEHOLDER = /\[CHECK:[^\]]*\]/gi;

export function checkPiece(
  blocks: readonly PieceBlock[],
  excerpts: readonly CheckExcerpt[],
  guardrails: CheckGuardrails,
): PieceCheck[] {
  if (blocks.length === 0) return [];
  const byId = new Map(excerpts.map((excerpt) => [excerpt.id, excerpt]));
  const checks: PieceCheck[] = [];

  // Pass 1: each clip, and whether the block right before it introduces its speaker.
  const unintroduced: { blockId: string; speaker: string; tokens: string[] }[] = [];
  blocks.forEach((block, index) => {
    if (block.type !== "actuality") return;
    const excerpt = byId.get(block.excerpt_id);
    if (!excerpt) return;

    const start = block.in_ms ?? excerpt.startMs;
    const end = block.out_ms ?? excerpt.endMs;
    const seconds = Math.max(0, Math.round((end - start) / 1000));
    if (seconds > LONG_CLIP_SECONDS) {
      checks.push({
        code: "long_clip",
        blockId: block.id,
        message: `This clip runs ${formatClock(seconds)}, long for radio. Trim it, or choose a shorter one, if the piece needs the room.`,
      });
    }

    const tokens = speakerNameTokens(excerpt.speaker);
    if (tokens.length === 0 || !excerpt.speaker) return;
    const previous = blocks[index - 1];
    if (previous?.type === "actuality") {
      const before = byId.get(previous.excerpt_id);
      // A second clip from the same voice needs no second introduction.
      if (before && before.speaker === excerpt.speaker) return;
    }
    const introduced =
      previous?.type === "narration" &&
      previous.role !== "anchor" &&
      mentionsSpeaker(previous.text, tokens);
    if (introduced) return;

    const where = !previous
      ? "it opens the piece"
      : previous.type === "actuality"
        ? "it follows another clip"
        : previous.role === "anchor"
          ? "it follows the anchor intro"
          : "the narration before it doesn't name them";
    unintroduced.push({ blockId: block.id, speaker: excerpt.speaker, tokens });
    checks.push({
      code: "unintroduced_clip",
      blockId: block.id,
      message: `Nothing right before this clip names ${excerpt.speaker} (${where}). A listener can't see who is talking; the reporter should introduce them.`,
    });
  });

  // Pass 2: a short narration that names the speaker of a clip nothing introduces, and is not
  // itself followed by a clip, is that clip's lead-in left behind.
  const reported = new Set<string>();
  blocks.forEach((block, index) => {
    if (block.type !== "narration" || block.role === "anchor") return;
    if (countWords(block.text) > LEAD_IN_MAX_WORDS) return;
    if (blocks[index + 1]?.type === "actuality") return;
    for (const clip of unintroduced) {
      if (reported.has(block.id) || !mentionsSpeaker(block.text, clip.tokens)) continue;
      reported.add(block.id);
      checks.push({
        code: "orphan_lead_in",
        blockId: block.id,
        message: `This reads as the lead-in to ${clip.speaker}'s clip, but the clip doesn't follow it. Move them together, or rewrite or remove this.`,
      });
    }
  });

  for (const block of blocks) {
    if (block.type !== "narration") continue;
    if (block.role !== "anchor") {
      const words = countWords(block.text);
      if (words > LONG_NARRATION_WORDS) {
        checks.push({
          code: "long_narration",
          blockId: block.id,
          message: `This narration runs ${words} words, more than a few sentences. Split it, or cut what the listener doesn't need.`,
        });
      }
    }
    const open = block.text.match(CHECK_PLACEHOLDER);
    if (open) {
      checks.push({
        code: "unresolved_placeholder",
        blockId: block.id,
        message: `Has ${open.length === 1 ? "a [CHECK] placeholder" : `${open.length} [CHECK] placeholders`} the reporter still has to fill in.`,
      });
    }
  }

  const length = computePieceLength(blocks, excerpts);
  const { targetSeconds, toleranceSeconds } = guardrails;
  if (targetSeconds !== null && toleranceSeconds !== undefined) {
    const diff = length.totalSeconds - targetSeconds;
    if (Math.abs(diff) > toleranceSeconds) {
      checks.push({
        code: "length",
        blockId: null,
        message: `${formatClock(length.totalSeconds)} against a ${formatClock(targetSeconds)} target (${formatClock(toleranceSeconds)} either way): ${Math.abs(diff) - toleranceSeconds}s ${diff > 0 ? "over" : "under"} the range.`,
      });
    }
  }

  const actualities = blocks.filter((block) => block.type === "actuality").length;
  const { minActualities, maxActualities } = guardrails;
  if (
    minActualities !== undefined &&
    maxActualities !== undefined &&
    (actualities < minActualities || actualities > maxActualities)
  ) {
    checks.push({
      code: "actuality_count",
      blockId: null,
      message: `${actualities} ${actualities === 1 ? "actuality" : "actualities"}; the format's usual range is ${actualityRangeLabel({ minActualities, maxActualities })}.`,
    });
  }

  return checks;
}
