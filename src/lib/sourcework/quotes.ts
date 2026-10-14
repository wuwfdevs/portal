// Suggested clips (docs/sourcework-analysis-design.md §20): the pure half — the
// shape a suggestion has on screen, the trim arithmetic, and the text of a
// clip derived from a transcript. No Supabase and no model here, so the rules that
// decide what a reporter is shown and what an accepted excerpt contains are tested
// on their own.

import { formatClockMs } from "@/lib/format";
import type { TimedToken } from "@/lib/transcription/selection";

export type QuoteStatus = "suggested" | "accepted" | "rejected";

/** A clip shorter than this is a word, not a quote. */
export const MIN_QUOTE_MS = 1500;
/** A clip longer than this is a passage, not an actuality. */
export const MAX_QUOTE_MS = 60_000;

/** The nudges on the trim chips, in milliseconds (the same four the excerpt rail uses). */
export const TRIM_STEPS_MS = [-250, -50, 50, 250] as const;

export interface QuoteSuggestion {
  id: string;
  sourceId: string;
  sourceTitle: string;
  representationId: string | null;
  speakerName: string | null;
  startMs: number;
  endMs: number;
  text: string;
  reason: string;
  status: QuoteStatus;
  excerptId: string | null;
}

/** "9s long", "1:05 long". */
export function formatClipLength(startMs: number, endMs: number): string {
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  if (seconds < 60) return `${seconds}s long`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")} long`;
}

/** "12:49–12:58 · 9s long". */
export function formatClipRange(startMs: number, endMs: number): string {
  return `${formatClockMs(startMs)}–${formatClockMs(endMs)} · ${formatClipLength(startMs, endMs)}`;
}

/** "12:49.0": a clip edge to the tenth of a second, which is what the trim chips move it by. */
export function formatClipTime(ms: number): string {
  const tenths = Math.floor(Math.max(0, ms) / 100);
  return `${formatClockMs(tenths * 100)}.${tenths % 10}`;
}

/** "0:09" for a phone card's one-line header. */
export function formatClipSeconds(startMs: number, endMs: number): string {
  const seconds = Math.max(0, Math.round((endMs - startMs) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export interface ClipRange {
  startMs: number;
  endMs: number;
}

/**
 * Moves one edge of a clip by `deltaMs`. The result always stays inside the source
 * (`durationMs` when known), never closer together than the shortest clip, and never
 * longer than the longest — the nudge that would break one of those moves the edge as
 * far as it can go instead of refusing, so a chip is never dead.
 */
export function nudgeEdge(
  range: ClipRange,
  edge: "in" | "out",
  deltaMs: number,
  durationMs: number | null,
): ClipRange {
  const ceiling = durationMs ?? Number.MAX_SAFE_INTEGER;
  if (edge === "in") {
    const latest = range.endMs - MIN_QUOTE_MS;
    const earliest = Math.max(0, range.endMs - MAX_QUOTE_MS);
    return {
      startMs: Math.round(Math.min(Math.max(range.startMs + deltaMs, earliest), latest)),
      endMs: range.endMs,
    };
  }
  const earliest = range.startMs + MIN_QUOTE_MS;
  const latest = Math.min(ceiling, range.startMs + MAX_QUOTE_MS);
  return {
    startMs: range.startMs,
    endMs: Math.round(
      Math.min(Math.max(range.endMs + deltaMs, earliest), Math.max(latest, earliest)),
    ),
  };
}

export type RangeCheck = { ok: true } | { ok: false; error: string };

/** The check an accept makes on a (possibly trimmed) range before it becomes an excerpt. */
export function checkQuoteRange(range: ClipRange, durationMs: number | null): RangeCheck {
  if (!Number.isFinite(range.startMs) || !Number.isFinite(range.endMs)) {
    return { ok: false, error: "That clip's start and end aren't valid." };
  }
  if (range.startMs < 0) return { ok: false, error: "A clip can't start before the recording." };
  if (durationMs !== null && range.endMs > durationMs + 500) {
    return { ok: false, error: "That clip runs past the end of the recording." };
  }
  if (range.endMs - range.startMs < MIN_QUOTE_MS) {
    return { ok: false, error: "That clip is too short to use. Trim it less." };
  }
  if (range.endMs - range.startMs > MAX_QUOTE_MS) {
    return { ok: false, error: "That clip is too long for a quote. Trim it shorter." };
  }
  return { ok: true };
}

/**
 * The words a clip contains: every token whose middle falls inside the range, in
 * reading order. A word half cut by the range is judged by where most of it is, so
 * trimming a nudge into the middle of a word drops or keeps the whole word, never half
 * of one.
 */
export function wordsInRange(
  tokensBySegment: readonly (readonly TimedToken[])[],
  range: ClipRange,
): string {
  const words: string[] = [];
  for (const tokens of tokensBySegment) {
    for (const token of tokens) {
      const middle = (token.startMs + token.endMs) / 2;
      if (middle >= range.startMs && middle < range.endMs) words.push(token.text);
    }
  }
  return words.join(" ");
}

/** Whether a proposed clip lands on the same stretch of the same source as one already on file. */
export function sameStretch(a: ClipRange, b: ClipRange): boolean {
  const overlap = Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
  if (overlap <= 0) return false;
  const shorter = Math.min(a.endMs - a.startMs, b.endMs - b.startMs);
  return shorter > 0 && overlap / shorter >= 0.5;
}
