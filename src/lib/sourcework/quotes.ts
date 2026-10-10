// Suggested quotes (docs/sourcework-analysis-design.md §5.5): the pure half — the
// tiers, the shape a suggestion has on screen, the trim arithmetic, and the text of a
// clip derived from a transcript. No Supabase and no model here, so the rules that
// decide what a reporter is shown and what an accepted excerpt contains are tested
// on their own.

import { formatClockMs } from "@/lib/format";
import type { TimedToken } from "@/lib/transcription/selection";

export const QUOTE_TIERS = ["strong", "good", "usable"] as const;
export type QuoteTier = (typeof QUOTE_TIERS)[number];

export const QUOTE_TIER_LABEL: Record<QuoteTier, string> = {
  strong: "Strong",
  good: "Good",
  usable: "Usable",
};

/** The number stored on an accepted excerpt (`sw_source_excerpts.quality_tier`). */
export const QUOTE_TIER_VALUE: Record<QuoteTier, number> = { strong: 3, good: 2, usable: 1 };

export type QuoteStatus = "suggested" | "accepted" | "rejected";

/** A clip shorter than this is a word, not a quote. */
export const MIN_QUOTE_MS = 1500;
/** A clip longer than this is a passage, not an actuality. */
export const MAX_QUOTE_MS = 60_000;
/** Suggestions kept per run: the screen is "a few clips worth considering", not a transcript. */
export const MAX_QUOTES_PER_RUN = 8;

/** The nudges on the trim chips, in milliseconds (the same four the excerpt rail uses). */
export const TRIM_STEPS_MS = [-250, -50, 50, 250] as const;

export function parseQuoteTier(value: unknown): QuoteTier | null {
  return QUOTE_TIERS.find((tier) => tier === value) ?? null;
}

export interface QuoteSuggestion {
  id: string;
  themeId: string;
  sourceId: string;
  sourceTitle: string;
  representationId: string | null;
  speakerName: string | null;
  startMs: number;
  endMs: number;
  text: string;
  reason: string;
  tier: QuoteTier;
  status: QuoteStatus;
  excerptId: string | null;
}

/** Strongest first, then in the order the clips occur in their source. */
export function compareQuotes(
  a: Pick<QuoteSuggestion, "tier" | "sourceTitle" | "startMs" | "id">,
  b: Pick<QuoteSuggestion, "tier" | "sourceTitle" | "startMs" | "id">,
): number {
  return (
    QUOTE_TIERS.indexOf(a.tier) - QUOTE_TIERS.indexOf(b.tier) ||
    a.sourceTitle.localeCompare(b.sourceTitle) ||
    a.startMs - b.startMs ||
    a.id.localeCompare(b.id)
  );
}

export interface QuoteCounts {
  waiting: number;
  accepted: number;
  rejected: number;
}

export function quoteCounts(quotes: readonly Pick<QuoteSuggestion, "status">[]): QuoteCounts {
  return {
    waiting: quotes.filter((quote) => quote.status === "suggested").length,
    accepted: quotes.filter((quote) => quote.status === "accepted").length,
    rejected: quotes.filter((quote) => quote.status === "rejected").length,
  };
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

/** The sentence under the cards when there is nothing to review. */
export function emptyQuotesMessage(counts: QuoteCounts, hasRun: boolean): string {
  if (counts.waiting > 0) return "";
  if (!hasRun) {
    return "No quotes have been suggested for this theme yet. Choose Suggest quotes to have the model read the evidence and the transcript around it.";
  }
  if (counts.accepted + counts.rejected > 0) {
    return "You have decided on every suggestion for this theme. Suggest quotes again to look for more.";
  }
  return "The model didn't find a clip in this theme's evidence that works on air. Add more accepted data points or cut one by hand from the source.";
}

export type GuideBlock = { kind: "paragraph"; text: string } | { kind: "list"; items: string[] };

/**
 * The quote quality guide as the screen shows it beside the cards: paragraphs, and lines that
 * start with "- " gathered into a list. Editors write plain text, so this is all the formatting
 * there is; nothing in it is ever interpreted as markup.
 */
export function guideBlocks(body: string): GuideBlock[] {
  const blocks: GuideBlock[] = [];
  for (const chunk of body.replace(/\r\n/g, "\n").split(/\n{2,}/)) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    let paragraph: string[] = [];
    let list: string[] = [];
    const flushParagraph = () => {
      if (paragraph.length > 0) blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    };
    const flushList = () => {
      if (list.length > 0) blocks.push({ kind: "list", items: list });
      list = [];
    };
    for (const line of lines) {
      const item = /^[-•*]\s+(.*)$/.exec(line);
      if (item) {
        flushParagraph();
        list.push(item[1]!);
      } else {
        flushList();
        paragraph.push(line);
      }
    }
    flushParagraph();
    flushList();
  }
  return blocks;
}
