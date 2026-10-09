// "Try this draft" (docs/sourcework-analysis-design.md §8.1): the live prompt
// and an editor's draft run on identical input, and the two answers are laid
// side by side. This file is the comparison and the stored shape; the run
// itself is lib/sourcework/trial-run.ts. Pure.
//
// Rows are aligned by the passage they point at — two data points whose spans
// overlap by at least half are the same finding — not by wording, because the
// whole point of editing a prompt is that the wording changes.

import { overlapRatio, SAME_PASSAGE_OVERLAP } from "./extraction-units";
import type { DataPointSpan } from "./research";

export interface TrialPoint {
  claim: string;
  /** "Firsthand · Q1" / "Firsthand · Story · Place". */
  tag: string;
  relevance: "question" | "story";
  storyElement: string | null;
  spans: DataPointSpan[];
  /** The units the point rests on, for matching only. */
  unitIds: number[];
}

export interface TrialSide {
  /** "Live v7", "Built-in" or "Draft". */
  label: string;
  runId: string | null;
  points: TrialPoint[];
}

export type TrialGroup = "both" | "draft_only" | "live_only";

export interface TrialRow {
  group: TrialGroup;
  live: TrialPoint | null;
  draft: TrialPoint | null;
}

export interface TrialResults {
  live: TrialSide;
  draft: TrialSide;
  rows: TrialRow[];
}

/**
 * Pairs each live point with the draft point it overlaps most (at least half),
 * one-to-one, then lists what is left on either side. Rows come back in the
 * order the passages occur in the source.
 */
export function matchTrialPoints(
  live: readonly TrialPoint[],
  draft: readonly TrialPoint[],
): TrialRow[] {
  const liveSets = live.map((point) => new Set(point.unitIds));
  const draftSets = draft.map((point) => new Set(point.unitIds));

  const candidates: { l: number; d: number; ratio: number; similarity: number }[] = [];
  live.forEach((_, l) => {
    draft.forEach((__, d) => {
      const ratio = overlapRatio(liveSets[l]!, draftSets[d]!);
      if (ratio >= SAME_PASSAGE_OVERLAP) {
        candidates.push({ l, d, ratio, similarity: jaccard(liveSets[l]!, draftSets[d]!) });
      }
    });
  });
  // Closest match first: whole-passage agreement beats one point sitting inside another.
  candidates.sort((a, b) => b.similarity - a.similarity || b.ratio - a.ratio || a.l - b.l || a.d - b.d);

  const livePaired = new Set<number>();
  const draftPaired = new Set<number>();
  const rows: { row: TrialRow; at: number }[] = [];
  for (const { l, d } of candidates) {
    if (livePaired.has(l) || draftPaired.has(d)) continue;
    livePaired.add(l);
    draftPaired.add(d);
    rows.push({ row: { group: "both", live: live[l]!, draft: draft[d]! }, at: firstUnit(live[l]!) });
  }
  live.forEach((point, l) => {
    if (!livePaired.has(l)) rows.push({ row: { group: "live_only", live: point, draft: null }, at: firstUnit(point) });
  });
  draft.forEach((point, d) => {
    if (!draftPaired.has(d)) rows.push({ row: { group: "draft_only", live: null, draft: point }, at: firstUnit(point) });
  });

  return rows.sort((a, b) => a.at - b.at).map((entry) => entry.row);
}

function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function firstUnit(point: TrialPoint): number {
  return point.unitIds.length === 0 ? Number.MAX_SAFE_INTEGER : Math.min(...point.unitIds);
}

export type TrialFilter = "all" | "draft_only" | "live_only" | "both";

export function trialRowCounts(rows: readonly TrialRow[]): Record<TrialFilter, number> {
  return {
    all: rows.length,
    draft_only: rows.filter((row) => row.group === "draft_only").length,
    live_only: rows.filter((row) => row.group === "live_only").length,
    both: rows.filter((row) => row.group === "both").length,
  };
}

export function filterTrialRows(rows: readonly TrialRow[], filter: TrialFilter): TrialRow[] {
  return filter === "all" ? [...rows] : rows.filter((row) => row.group === filter);
}

/** "12 data points (8 responsive, 4 story)" — the column heading of each side. */
export function describeTrialSide(points: readonly Pick<TrialPoint, "relevance">[]): string {
  const story = points.filter((point) => point.relevance === "story").length;
  const responsive = points.length - story;
  return `${points.length} data point${points.length === 1 ? "" : "s"} (${responsive} responsive, ${story} story)`;
}

/** Parses a stored `results` column back into its shape, or null if it isn't one. */
export function parseTrialResults(value: unknown): TrialResults | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<TrialResults>;
  if (!candidate.live || !candidate.draft || !Array.isArray(candidate.rows)) return null;
  if (!Array.isArray(candidate.live.points) || !Array.isArray(candidate.draft.points)) return null;
  return candidate as TrialResults;
}

/** How long a trial's results are kept (the column default); the screen says so. */
export const TRIAL_KEEP_DAYS = 14;
