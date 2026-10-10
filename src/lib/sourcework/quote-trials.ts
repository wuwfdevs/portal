// "Try this draft" for the quote quality guide (docs/sourcework-analysis-design.md §5.5, §8.1): the
// live guide and an editor's draft each choose clips from the same theme's evidence, and the two
// ranked lists are laid side by side. This file is the comparison, the stored shape and the sample
// list; the run itself is lib/sourcework/quote-trial-run.ts. Pure.
//
// Clips are matched by the stretch of the recording they cover — two clips that share at least half of
// the shorter one are the same clip, however each guide worded its reason — because the point of
// editing the guide is that the choices change, not that the wording does.

import { sameStretch, type QuoteStance, type QuoteTier } from "./quotes";
import type { TrialFilter, TrialGroup } from "./trials";

export interface TrialQuote {
  sourceId: string;
  sourceTitle: string;
  startMs: number;
  endMs: number;
  text: string;
  tier: QuoteTier;
  why: string;
  stance: QuoteStance;
}

export interface QuoteTrialSide {
  /** "Live v7", "Built-in" or "Draft". */
  label: string;
  runId: string | null;
  quotes: TrialQuote[];
}

export interface QuoteTrialRow {
  group: TrialGroup;
  live: TrialQuote | null;
  draft: TrialQuote | null;
}

export interface QuoteTrialResults {
  kind: "quotes";
  live: QuoteTrialSide;
  draft: QuoteTrialSide;
  rows: QuoteTrialRow[];
}

function overlapMs(a: TrialQuote, b: TrialQuote): number {
  return Math.min(a.endMs, b.endMs) - Math.max(a.startMs, b.startMs);
}

/**
 * Pairs each live clip with the draft clip it overlaps most (at least half of the shorter), one to
 * one, then lists what is left on either side. Rows come back in the order the clips occur: by source,
 * then by time.
 */
export function matchTrialQuotes(
  live: readonly TrialQuote[],
  draft: readonly TrialQuote[],
): QuoteTrialRow[] {
  const candidates: { l: number; d: number; overlap: number }[] = [];
  live.forEach((a, l) => {
    draft.forEach((b, d) => {
      if (a.sourceId === b.sourceId && sameStretch(a, b)) {
        candidates.push({ l, d, overlap: overlapMs(a, b) });
      }
    });
  });
  candidates.sort((x, y) => y.overlap - x.overlap || x.l - y.l || x.d - y.d);

  const livePaired = new Set<number>();
  const draftPaired = new Set<number>();
  const rows: QuoteTrialRow[] = [];
  for (const { l, d } of candidates) {
    if (livePaired.has(l) || draftPaired.has(d)) continue;
    livePaired.add(l);
    draftPaired.add(d);
    rows.push({ group: "both", live: live[l]!, draft: draft[d]! });
  }
  live.forEach((quote, l) => {
    if (!livePaired.has(l)) rows.push({ group: "live_only", live: quote, draft: null });
  });
  draft.forEach((quote, d) => {
    if (!draftPaired.has(d)) rows.push({ group: "draft_only", live: null, draft: quote });
  });

  const anchor = (row: QuoteTrialRow) => (row.live ?? row.draft)!;
  return rows.sort((a, b) => {
    const x = anchor(a);
    const y = anchor(b);
    return x.sourceTitle.localeCompare(y.sourceTitle) || x.startMs - y.startMs;
  });
}

export function quoteRowCounts(rows: readonly QuoteTrialRow[]): Record<TrialFilter, number> {
  return {
    all: rows.length,
    draft_only: rows.filter((row) => row.group === "draft_only").length,
    live_only: rows.filter((row) => row.group === "live_only").length,
    both: rows.filter((row) => row.group === "both").length,
  };
}

export function filterQuoteRows(
  rows: readonly QuoteTrialRow[],
  filter: TrialFilter,
): QuoteTrialRow[] {
  return filter === "all" ? [...rows] : rows.filter((row) => row.group === filter);
}

/** "5 clips (2 strong, 2 good, 1 usable)" — the heading of each side. */
export function describeQuoteSide(quotes: readonly Pick<TrialQuote, "tier">[]): string {
  const count = (tier: QuoteTier) => quotes.filter((quote) => quote.tier === tier).length;
  const parts = (["strong", "good", "usable"] as const)
    .map((tier) => [tier, count(tier)] as const)
    .filter(([, n]) => n > 0)
    .map(([tier, n]) => `${n} ${tier}`);
  return `${quotes.length} clip${quotes.length === 1 ? "" : "s"}${parts.length > 0 ? ` (${parts.join(", ")})` : ""}`;
}

/** Parses a stored `results` column back into its shape, or null if it isn't one. */
export function parseQuoteTrialResults(value: unknown): QuoteTrialResults | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<QuoteTrialResults>;
  if (candidate.kind !== "quotes" || !candidate.live || !candidate.draft) return null;
  if (!Array.isArray(candidate.rows)) return null;
  if (!Array.isArray(candidate.live.quotes) || !Array.isArray(candidate.draft.quotes)) return null;
  return candidate as QuoteTrialResults;
}

// Samples ---------------------------------------------------------------------------------

export interface QuoteSampleTheme {
  id: string;
  /** "Locals treated the tunnels as a playground · 11 for, 2 against" */
  label: string;
}

export interface QuoteSampleProject {
  id: string;
  title: string;
  themes: QuoteSampleTheme[];
}

/**
 * Projects with at least one accepted theme that has evidence, each with those themes. The sample
 * is a theme because that is what the step runs on; the project only supplies the title.
 */
export function groupQuoteSamples(args: {
  projects: readonly { id: string; title: string }[];
  themes: readonly {
    id: string;
    projectId: string;
    title: string;
    supporting: number;
    complicating: number;
  }[];
}): QuoteSampleProject[] {
  const byProject = new Map<string, QuoteSampleTheme[]>();
  for (const theme of args.themes) {
    if (theme.supporting + theme.complicating === 0) continue;
    const list = byProject.get(theme.projectId) ?? [];
    list.push({
      id: theme.id,
      label: `${theme.title} · ${theme.supporting} for, ${theme.complicating} against`,
    });
    byProject.set(theme.projectId, list);
  }
  return args.projects
    .filter((project) => (byProject.get(project.id)?.length ?? 0) > 0)
    .map((project) => ({
      id: project.id,
      title: project.title,
      themes: (byProject.get(project.id) ?? []).sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

/** A valid project/theme pair from the samples, else the first project's first theme, else null. */
export function pickDefaultQuoteSample(
  samples: readonly QuoteSampleProject[],
  last: { projectId: string; themeId: string } | null,
): { projectId: string; themeId: string } | null {
  if (last) {
    const project = samples.find((entry) => entry.id === last.projectId);
    if (project?.themes.some((theme) => theme.id === last.themeId)) return last;
  }
  const first = samples[0];
  return first ? { projectId: first.id, themeId: first.themes[0]!.id } : null;
}
