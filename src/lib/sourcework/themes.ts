// The themes model, shared by the server and every screen (no "server-only", no
// Supabase): what a theme and its numbers are, how a row is labelled, filtered
// and ordered, how the "Waiting for you" strip reads, and how a theme page
// groups its evidence. See docs/sourcework-analysis-design.md §4.5, §5.4, §7.1.
//
// A theme is a claim-style statement, not a topic. Its breadth numbers —
// distinct sources, distinct speakers, supporting against complicating — are
// computed from its data points (sw_theme_breadth), never stored, and ranking
// is by breadth rather than by how often something was said (§2.5).

import { collapseWhitespace } from "@/lib/text";
import { formatShortDate, pluralize } from "@/lib/format";

export const THEME_STATUSES = ["suggested", "accepted", "rejected"] as const;
export type ThemeStatus = (typeof THEME_STATUSES)[number];

export type Stance = "supports" | "complicates";

export const STANCE_LABEL: Record<Stance, string> = {
  supports: "Supports",
  complicates: "Complicates",
};

export const THEME_TITLE_MAX = 200;
export const THEME_DEFINITION_MAX = 600;
export const THEME_MEMO_MAX = 4000;
/** The most themes a project can usefully carry; the assignment prompt lists the candidates. */
export const THEME_LIMIT = 40;

export interface ThemeBreadth {
  sourceCount: number;
  speakerCount: number;
  supporting: number;
  complicating: number;
}

export const EMPTY_BREADTH: ThemeBreadth = {
  sourceCount: 0,
  speakerCount: 0,
  supporting: 0,
  complicating: 0,
};

export interface Theme {
  id: string;
  projectId: string;
  title: string;
  definition: string;
  /** Human-only; no run ever reads or writes it. */
  memo: string;
  status: ThemeStatus;
  origin: "model" | "person";
  createdBy: string;
  createdAt: string;
  acceptedBy: string | null;
  acceptedAt: string | null;
}

/** A theme as the Themes tab lists it: the row plus its computed numbers. */
export interface ThemeRow extends Theme {
  breadth: ThemeBreadth;
  /** Ids of the research questions its data points answer. */
  questionIds: string[];
}

/** "Merge A into B" — a suggestion that describes a change; accepting performs it. */
export interface MergeSuggestion {
  id: string;
  fromThemeId: string;
  intoThemeId: string;
  reason: string;
  createdAt: string;
}

// Text ----------------------------------------------------------------------------

export type ThemeTextCheck =
  { ok: true; title: string; definition: string } | { ok: false; error: string };

/** A theme needs a title and a one-sentence definition; both are plain text. */
export function validateThemeText(input: { title: unknown; definition: unknown }): ThemeTextCheck {
  const title = typeof input.title === "string" ? collapseWhitespace(input.title) : "";
  const definition =
    typeof input.definition === "string" ? collapseWhitespace(input.definition) : "";
  if (title === "") return { ok: false, error: "Write the theme first." };
  if (title.length > THEME_TITLE_MAX) {
    return { ok: false, error: `Keep a theme under ${THEME_TITLE_MAX} characters.` };
  }
  if (definition === "") {
    return { ok: false, error: "Add a sentence that says what the theme claims." };
  }
  if (definition.length > THEME_DEFINITION_MAX) {
    return { ok: false, error: `Keep the definition under ${THEME_DEFINITION_MAX} characters.` };
  }
  return { ok: true, title, definition };
}

/** The memo keeps its line breaks; only the ends are trimmed. */
export function validateMemo(
  raw: unknown,
): { ok: true; memo: string } | { ok: false; error: string } {
  const memo = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (memo.length > THEME_MEMO_MAX) {
    return {
      ok: false,
      error: `Keep the memo under ${THEME_MEMO_MAX.toLocaleString("en-US")} characters.`,
    };
  }
  return { ok: true, memo };
}

/**
 * A theme says something ("Locals treated the fort's tunnels as a private
 * playground"); a topic only names a subject ("Childhood"). The list flags a
 * suggestion that reads as a topic (§4.5). A statement needs room for a
 * subject and a predicate, so under four words is a topic.
 */
export function readsLikeTopic(title: string): boolean {
  return collapseWhitespace(title).split(" ").filter(Boolean).length < 4;
}

// Labels ----------------------------------------------------------------------------

/** "3 of 4" — the sources behind a theme out of the project's. */
export function sourcesLabel(breadth: Pick<ThemeBreadth, "sourceCount">, projectSources: number) {
  return `${breadth.sourceCount} of ${Math.max(projectSources, breadth.sourceCount)}`;
}

/**
 * One source is a flag, not a verdict (§2.5). It is only worth flagging when
 * the project has others the theme could have drawn on.
 */
export function isSingleSource(
  breadth: Pick<ThemeBreadth, "sourceCount">,
  projectSources: number,
): boolean {
  return breadth.sourceCount === 1 && projectSources > 1;
}

/** "Q1 · Q3" for the questions a theme's data points answer, in question order. */
export function questionLine(
  questionIds: readonly string[],
  labels: ReadonlyMap<string, string>,
): string {
  const named = questionIds
    .map((id) => labels.get(id))
    .filter((label): label is string => Boolean(label));
  const unique = [...new Set(named)];
  unique.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)) || a.localeCompare(b));
  return unique.join(" · ");
}

export function evidenceSummary(supporting: number, complicating: number): string {
  if (supporting === 0 && complicating === 0) return "No evidence yet";
  const parts: string[] = [];
  if (supporting > 0) parts.push(`${supporting} supporting`);
  if (complicating > 0) parts.push(`${complicating} complicating`);
  return parts.join(", ");
}

// Listing -----------------------------------------------------------------------------

export type ThemeStatusFilter = "all" | "accepted" | "suggested" | "rejected";

export interface ThemeFilters {
  status: ThemeStatusFilter;
  questionId: string | null;
  search: string;
}

export function parseStatusFilter(value: string | undefined): ThemeStatusFilter {
  return value === "accepted" || value === "suggested" || value === "rejected" ? value : "all";
}

/** Breadth first (sources, then speakers, then evidence), then wording — never repetition alone. */
export function compareByBreadth(a: ThemeRow, b: ThemeRow): number {
  return (
    b.breadth.sourceCount - a.breadth.sourceCount ||
    b.breadth.speakerCount - a.breadth.speakerCount ||
    b.breadth.supporting - a.breadth.supporting ||
    a.title.localeCompare(b.title)
  );
}

/**
 * The rows a filter shows, in order: accepted themes by breadth, then the
 * suggestions waiting for a decision, then (only when asked for) rejected ones.
 * "All" hides rejected, as a rejection hides everywhere else.
 */
export function filterThemeRows(rows: readonly ThemeRow[], filters: ThemeFilters): ThemeRow[] {
  const needle = filters.search.trim().toLowerCase();
  const matching = rows.filter((row) => {
    if (filters.status === "all" ? row.status === "rejected" : row.status !== filters.status) {
      return false;
    }
    if (filters.questionId && !row.questionIds.includes(filters.questionId)) return false;
    if (needle && !`${row.title} ${row.definition}`.toLowerCase().includes(needle)) return false;
    return true;
  });
  const rank = (row: ThemeRow) =>
    row.status === "accepted" ? 0 : row.status === "suggested" ? 1 : 2;
  return matching.sort((a, b) => rank(a) - rank(b) || compareByBreadth(a, b));
}

/** Suggested themes plus merge suggestions between live themes — what the tab's badge counts. */
export function decisionsWaiting(counts: { suggestedThemes: number; suggestedMerges: number }) {
  return counts.suggestedThemes + counts.suggestedMerges;
}

// The "Waiting for you" strip -----------------------------------------------------------

export interface WaitingInput {
  /** Data points to review, by source, for the project's current sources only. */
  toReviewBySource: readonly { sourceId: string; title: string; count: number }[];
  /** Accepted data points that sit in no live theme. */
  unthemed: number;
  suggestedThemes: number;
  suggestedMerges: number;
}

export interface WaitingSummary {
  toReview: { total: number; sources: { sourceId: string; title: string; count: number }[] } | null;
  unthemed: number;
  suggestions: number;
  /** Nothing is waiting on this reporter. */
  clear: boolean;
}

export function waitingSummary(input: WaitingInput): WaitingSummary {
  const sources = input.toReviewBySource
    .filter((entry) => entry.count > 0)
    .sort((a, b) => b.count - a.count || a.title.localeCompare(b.title));
  const total = sources.reduce((sum, entry) => sum + entry.count, 0);
  const suggestions = input.suggestedThemes + input.suggestedMerges;
  return {
    toReview: total > 0 ? { total, sources } : null,
    unthemed: input.unthemed,
    suggestions,
    clear: total === 0 && input.unthemed === 0 && suggestions === 0,
  };
}

// Theme page: evidence by source ------------------------------------------------------------

export type EvidenceShow = "all" | "supporting" | "complicating";

export function parseEvidenceShow(value: string | undefined): EvidenceShow {
  return value === "supporting" || value === "complicating" ? value : "all";
}

export interface EvidenceItem {
  dataPointId: string;
  sourceId: string;
  sourceTitle: string;
  stance: Stance;
  claim: string;
  /** What the point answers: a research question, or the story. */
  relevance: "question" | "story";
  questionId: string | null;
  /** Where the point starts, for ordering within a source. */
  position: number;
}

export interface EvidenceGroup {
  sourceId: string;
  sourceTitle: string;
  items: EvidenceItem[];
  supporting: number;
  complicating: number;
}

export function filterEvidence<T extends { stance: Stance }>(
  items: readonly T[],
  show: EvidenceShow,
) {
  if (show === "supporting") return items.filter((item) => item.stance === "supports");
  if (show === "complicating") return items.filter((item) => item.stance === "complicates");
  return [...items];
}

/**
 * Evidence grouped by source — the sources with the most support first, the
 * lone complicating source after — and, within one, the supporting points
 * before the complicating ones, each in the order they occur.
 */
export function groupEvidenceBySource(items: readonly EvidenceItem[]): EvidenceGroup[] {
  const groups = new Map<string, EvidenceGroup>();
  for (const item of items) {
    let group = groups.get(item.sourceId);
    if (!group) {
      group = {
        sourceId: item.sourceId,
        sourceTitle: item.sourceTitle,
        items: [],
        supporting: 0,
        complicating: 0,
      };
      groups.set(item.sourceId, group);
    }
    group.items.push(item);
    if (item.stance === "supports") group.supporting += 1;
    else group.complicating += 1;
  }
  const result = [...groups.values()];
  for (const group of result) {
    group.items.sort(
      (a, b) =>
        Number(a.stance === "complicates") - Number(b.stance === "complicates") ||
        a.position - b.position ||
        a.dataPointId.localeCompare(b.dataPointId),
    );
  }
  return result.sort(
    (a, b) =>
      b.supporting - a.supporting ||
      b.items.length - a.items.length ||
      a.sourceTitle.localeCompare(b.sourceTitle),
  );
}

/** "5 supporting" / "4 supporting, 1 complicating" for a source group's heading. */
export function groupSummary(group: Pick<EvidenceGroup, "supporting" | "complicating">): string {
  return evidenceSummary(group.supporting, group.complicating);
}

// Theme page: history ---------------------------------------------------------------------------

export interface HistoryMembership {
  createdAt: string;
  assignedBy: "model" | "person";
  runId: string | null;
  sourceTitle: string;
}

export interface HistoryEntry {
  at: string;
  text: string;
}

/**
 * The theme's own timeline, derived from what is stored rather than from a
 * change-log table (§10: not scheduled): how it began, when a person accepted
 * it, and data points that arrived afterwards, one line per day and source.
 */
export function buildThemeHistory(input: {
  theme: Pick<Theme, "origin" | "createdAt" | "acceptedAt" | "status"> & { runId: string | null };
  createdByName: string | null;
  acceptedByName: string | null;
  memberships: readonly HistoryMembership[];
}): HistoryEntry[] {
  const { theme, memberships } = input;
  const entries: HistoryEntry[] = [];

  const founding = memberships.filter((m) =>
    theme.runId ? m.runId === theme.runId : m.createdAt <= theme.createdAt,
  );
  if (theme.origin === "model") {
    entries.push({
      at: theme.createdAt,
      text:
        founding.length > 0
          ? `Review themes proposed it from ${pluralize(founding.length, "data point")}`
          : "Review themes proposed it",
    });
  } else {
    entries.push({
      at: theme.createdAt,
      text: `${input.createdByName ?? "Someone"} created the theme`,
    });
  }

  if (theme.acceptedAt) {
    entries.push({
      at: theme.acceptedAt,
      text: `${input.acceptedByName ?? "Someone"} accepted the theme`,
    });
  }

  const foundingSet = new Set(founding);
  const later = new Map<string, { at: string; count: number; model: boolean; source: string }>();
  for (const membership of memberships) {
    if (foundingSet.has(membership)) continue;
    const day = membership.createdAt.slice(0, 10);
    const key = `${day}|${membership.sourceTitle}|${membership.assignedBy}`;
    const existing = later.get(key);
    if (existing) {
      existing.count += 1;
      if (membership.createdAt < existing.at) existing.at = membership.createdAt;
    } else {
      later.set(key, {
        at: membership.createdAt,
        count: 1,
        model: membership.assignedBy === "model",
        source: membership.sourceTitle,
      });
    }
  }
  for (const group of later.values()) {
    entries.push({
      at: group.at,
      text: `${pluralize(group.count, "data point")} ${group.model ? "assigned" : "added"} from ${group.source}`,
    });
  }

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

/** "Oct 8 · Alex B. accepted the theme" */
export function formatHistoryEntry(entry: HistoryEntry): string {
  return `${formatShortDate(entry.at)} · ${entry.text}`;
}
