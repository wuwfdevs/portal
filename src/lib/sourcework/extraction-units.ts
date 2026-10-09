// How a source is shown to the extraction model and how its answer is turned
// back into places in the source. Pure (no "server-only", no Supabase), so the
// part that decides what a data point points at is tested without a model.
// See docs/sourcework-analysis-design.md §5.2 and principle 3: the model never
// types out source text — it names *units*, and code derives the timestamps or
// the page and block ids.
//
// A unit is the smallest passage the model may point at: a sentence of a
// transcript, or a block of a document. Units are numbered 1..N across the whole
// source (not per window), so a range means the same thing whichever window of a
// long source it came back from.

import { buildTimedTokens, type TimedToken } from "@/lib/transcription/selection";
import { collapseWhitespace, countWords } from "@/lib/text";
import type { DataPointSpan } from "./research";

export interface ExtractionUnit {
  /** 1-based, unique across the source. */
  id: number;
  /** Which segment (transcript) or page (document) the unit sits in — the header it is listed under. */
  groupIndex: number;
  text: string;
  /** Transcript units. */
  startMs?: number;
  endMs?: number;
  segmentIndex?: number;
  /** Document units. */
  blockId?: string;
  pageNumber?: number;
}

export interface ExtractionGroup {
  index: number;
  /** "12:41 · Tom Reyes" or "Page 3" — printed above its units. */
  label: string;
}

export interface UnitSet {
  units: ExtractionUnit[];
  groups: ExtractionGroup[];
}

/** A sentence is never allowed to run on past this many words, whatever the punctuation. */
const MAX_UNIT_WORDS = 70;

const ABBREVIATIONS = new Set([
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "st.",
  "sr.",
  "jr.",
  "vs.",
  "etc.",
  "no.",
  "gen.",
  "col.",
  "capt.",
  "lt.",
  "sgt.",
  "rev.",
  "prof.",
  "fig.",
  "u.s.",
  "a.m.",
  "p.m.",
]);

/** Whether a word closes a sentence: ends in . ? or ! (a closing quote or bracket may follow). */
export function endsSentence(word: string): boolean {
  const match = /([.?!…])["'”’)\]]*$/.exec(word);
  if (!match) return false;
  if (match[1] !== ".") return true;
  const bare = word.toLowerCase().replace(/["'”’)\]]+$/, "");
  if (ABBREVIATIONS.has(bare)) return false;
  // An initial ("J.") or a dotted acronym ("U.S.A.") is not the end of a sentence.
  if (/^(?:[a-z]\.){1,}$/i.test(bare)) return false;
  return true;
}

export interface UnitSegment {
  startMs: number;
  endMs: number;
  text: string;
  words: { w: string; s: number; e: number }[];
  speakerLabel: string;
}

/** Splits one line's tokens into sentences, as [from, to] token index pairs, ends inclusive. */
export function splitSentences(tokens: readonly Pick<TimedToken, "text">[]): [number, number][] {
  const ranges: [number, number][] = [];
  let from = 0;
  tokens.forEach((token, index) => {
    const length = index - from + 1;
    if (endsSentence(token.text) || length >= MAX_UNIT_WORDS) {
      ranges.push([from, index]);
      from = index + 1;
    }
  });
  if (from < tokens.length) ranges.push([from, tokens.length - 1]);
  return ranges;
}

/**
 * A transcript as numbered sentences, grouped under the line they came from.
 * Timings come from the same tokenizer the transcript screen highlights with
 * (buildTimedTokens), so a span lands on exactly the words the reporter sees.
 */
export function buildTranscriptUnits(
  segments: readonly UnitSegment[],
  formatTime: (ms: number) => string,
): UnitSet {
  const units: ExtractionUnit[] = [];
  const groups: ExtractionGroup[] = [];
  let nextId = 1;

  segments.forEach((segment, segmentIndex) => {
    const tokens = buildTimedTokens(segment);
    if (tokens.length === 0) return;
    groups.push({
      index: segmentIndex,
      label: `${formatTime(segment.startMs)} · ${segment.speakerLabel}`,
    });
    for (const [from, to] of splitSentences(tokens)) {
      const first = tokens[from]!;
      const last = tokens[to]!;
      units.push({
        id: nextId++,
        groupIndex: segmentIndex,
        segmentIndex,
        text: tokens
          .slice(from, to + 1)
          .map((token) => token.text)
          .join(" "),
        startMs: first.startMs,
        endMs: Math.max(last.endMs, first.startMs + 1),
      });
    }
  });

  return { units, groups };
}

export interface UnitBlock {
  id: string;
  pageNumber: number;
  blockType: string;
  text: string;
}

/** Blocks that are page furniture, not content. */
const SKIPPED_BLOCK_TYPES = new Set(["header", "footer"]);

/** A document as numbered blocks in reading order, grouped by page. */
export function buildDocumentUnits(blocks: readonly UnitBlock[]): UnitSet {
  const units: ExtractionUnit[] = [];
  const groups: ExtractionGroup[] = [];
  const seenPages = new Set<number>();
  let nextId = 1;

  for (const block of blocks) {
    if (SKIPPED_BLOCK_TYPES.has(block.blockType)) continue;
    const text = collapseWhitespace(block.text);
    if (text === "") continue;
    if (!seenPages.has(block.pageNumber)) {
      seenPages.add(block.pageNumber);
      groups.push({ index: block.pageNumber, label: `Page ${block.pageNumber}` });
    }
    units.push({
      id: nextId++,
      groupIndex: block.pageNumber,
      text,
      blockId: block.id,
      pageNumber: block.pageNumber,
    });
  }

  return { units, groups };
}

/** The units as the model reads them: a header per line or page, then "[n] sentence" in order. */
export function renderUnits(units: readonly ExtractionUnit[], groups: readonly ExtractionGroup[]): string {
  const labelByGroup = new Map(groups.map((group) => [group.index, group.label]));
  const lines: string[] = [];
  let currentGroup: number | null = null;
  for (const unit of units) {
    if (unit.groupIndex !== currentGroup) {
      currentGroup = unit.groupIndex;
      lines.push(`## ${labelByGroup.get(unit.groupIndex) ?? ""}`.trimEnd());
    }
    lines.push(`[${unit.id}] ${unit.text}`);
  }
  return lines.join("\n");
}

// Windows ------------------------------------------------------------------------------

export interface WindowOptions {
  maxWords?: number;
  overlapWords?: number;
}

const DEFAULT_MAX_WORDS = 9000;
const DEFAULT_OVERLAP_WORDS = 500;

/**
 * Splits a long source into overlapping windows of whole units, each small
 * enough to read in one model call. A source that fits is one window. The
 * overlap exists so a passage that straddles a boundary is whole in at least
 * one window; the duplicate it can produce is removed by dropOverlapping().
 */
export function windowUnits(
  units: readonly ExtractionUnit[],
  options: WindowOptions = {},
): ExtractionUnit[][] {
  const maxWords = options.maxWords ?? DEFAULT_MAX_WORDS;
  const overlapWords = Math.min(options.overlapWords ?? DEFAULT_OVERLAP_WORDS, maxWords / 2);
  if (units.length === 0) return [];

  const words = units.map((unit) => countWords(unit.text));
  const windows: ExtractionUnit[][] = [];
  let start = 0;

  while (start < units.length) {
    let end = start;
    let total = 0;
    // Always take at least one unit so a single huge block still makes progress.
    while (end < units.length && (end === start || total + words[end]! <= maxWords)) {
      total += words[end]!;
      end += 1;
    }
    windows.push(units.slice(start, end));
    if (end >= units.length) break;

    // Step back over roughly `overlapWords` words, but always advance.
    let back = end;
    let overlap = 0;
    while (back > start + 1 && overlap + words[back - 1]! <= overlapWords) {
      overlap += words[back - 1]!;
      back -= 1;
    }
    start = Math.max(back, start + 1);
  }

  return windows;
}

// Ranges --------------------------------------------------------------------------------------

export interface UnitRange {
  from: number;
  to: number;
}

/** The longest run of units one span may cover; past it the model has pointed at a chapter, not a passage. */
export const MAX_SPAN_UNITS = 20;

/** Sorts ranges and merges any that overlap or touch. */
export function mergeRanges(ranges: readonly UnitRange[]): UnitRange[] {
  const sorted = [...ranges].sort((a, b) => a.from - b.from || a.to - b.to);
  const merged: UnitRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.from <= last.to + 1) last.to = Math.max(last.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

/** The unit ids a set of ranges covers. */
export function unitIdsOf(ranges: readonly UnitRange[]): Set<number> {
  const ids = new Set<number>();
  for (const range of ranges) for (let id = range.from; id <= range.to; id++) ids.add(id);
  return ids;
}

/**
 * Turns merged unit ranges into the spans that are stored: one time range per
 * run for a transcript, one page-bounded block range per run for a document
 * (a run that crosses a page break becomes a span per page). Ranges that name a
 * unit the source doesn't have are dropped by the caller before this runs.
 */
export function resolveSpans(
  ranges: readonly UnitRange[],
  unitsById: ReadonlyMap<number, ExtractionUnit>,
): DataPointSpan[] {
  const spans: DataPointSpan[] = [];
  for (const range of mergeRanges(ranges)) {
    const covered: ExtractionUnit[] = [];
    for (let id = range.from; id <= range.to; id++) {
      const unit = unitsById.get(id);
      if (unit) covered.push(unit);
    }
    if (covered.length === 0) continue;

    const first = covered[0]!;
    if (first.startMs !== undefined) {
      const last = covered[covered.length - 1]!;
      spans.push({ kind: "temporal", startMs: first.startMs, endMs: last.endMs ?? first.startMs + 1 });
      continue;
    }

    let pageStart = 0;
    for (let index = 1; index <= covered.length; index++) {
      if (index === covered.length || covered[index]!.pageNumber !== covered[pageStart]!.pageNumber) {
        const pageFirst = covered[pageStart]!;
        const pageLast = covered[index - 1]!;
        spans.push({
          kind: "document",
          pageNumber: pageFirst.pageNumber ?? 1,
          firstBlockId: pageFirst.blockId ?? null,
          lastBlockId: pageLast.blockId ?? null,
        });
        pageStart = index;
      }
    }
  }
  return spans;
}

/**
 * Which units a stored span covers — the inverse of resolveSpans(), so a data
 * point already in the database can be compared with a fresh suggestion on the
 * same footing. A time span covers the units it overlaps; a document span
 * covers the units from its first block to its last on that page.
 */
export function unitIdsForSpan(span: DataPointSpan, units: readonly ExtractionUnit[]): Set<number> {
  const ids = new Set<number>();
  if (span.kind === "temporal") {
    for (const unit of units) {
      if (unit.startMs === undefined || unit.endMs === undefined) continue;
      if (unit.startMs < span.endMs && unit.endMs > span.startMs) ids.add(unit.id);
    }
    return ids;
  }

  const onPage = units.filter((unit) => unit.pageNumber === span.pageNumber);
  if (onPage.length === 0) return ids;
  const firstIndex = span.firstBlockId
    ? onPage.findIndex((unit) => unit.blockId === span.firstBlockId)
    : 0;
  const lastIndex = span.lastBlockId
    ? onPage.findIndex((unit) => unit.blockId === span.lastBlockId)
    : onPage.length - 1;
  // A block that was regenerated no longer resolves; the page is all that is left to go on.
  const from = firstIndex === -1 ? 0 : firstIndex;
  const to = lastIndex === -1 ? onPage.length - 1 : lastIndex;
  for (let index = from; index <= to; index++) ids.add(onPage[index]!.id);
  return ids;
}

/** The share of the *smaller* of two unit sets that the other covers: 1 means one lies wholly inside the other. */
export function overlapRatio(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/** Two points at least this much on top of each other are the same passage. */
export const SAME_PASSAGE_OVERLAP = 0.5;

/**
 * Keeps the first of any group of candidates that sit on the same passage with
 * the same bearing (same question, or both story). The overlap between windows
 * is what makes duplicates possible; the earlier window's reading wins because
 * it saw the passage from its start.
 */
export function dropOverlapping<
  T extends { unitIds: ReadonlySet<number>; relevance: string; questionKey: string | null },
>(candidates: readonly T[]): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  for (const candidate of candidates) {
    const duplicate = kept.some(
      (existing) =>
        existing.relevance === candidate.relevance &&
        existing.questionKey === candidate.questionKey &&
        overlapRatio(existing.unitIds, candidate.unitIds) >= SAME_PASSAGE_OVERLAP,
    );
    if (!duplicate) kept.push(candidate);
  }
  return { kept, dropped: candidates.length - kept.length };
}
