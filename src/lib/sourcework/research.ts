// The research model, shared by the server and every screen (no "server-only",
// no Supabase): what a research question, a background note and a data point
// are, how they are labelled and tagged, and how their time or page ranges
// read. See docs/sourcework-analysis-design.md §4.1–§4.4, §5.3.
//
// A data point is a paraphrase; an excerpt is a literal cut (§2.2). Nothing in
// this file carries source text — the words a span points at are derived from
// the transcript or the document blocks when a screen needs them.

import { formatDuration } from "@/lib/transcription/media";

export const DATA_POINT_KINDS = ["firsthand", "secondhand", "opinion", "factual"] as const;
export type DataPointKind = (typeof DATA_POINT_KINDS)[number];

export const STORY_ELEMENTS = ["character", "place", "moment", "detail", "background"] as const;
export type StoryElement = (typeof STORY_ELEMENTS)[number];

export const DATA_POINT_STATUSES = ["suggested", "accepted", "rejected"] as const;
export type DataPointStatus = (typeof DATA_POINT_STATUSES)[number];

export type DataPointRelevance = "question" | "story";

export const KIND_LABEL: Record<DataPointKind, string> = {
  firsthand: "Firsthand",
  secondhand: "Secondhand",
  opinion: "Opinion",
  factual: "Factual",
};

export const STORY_ELEMENT_LABEL: Record<StoryElement, string> = {
  character: "Character",
  place: "Place",
  moment: "Moment",
  detail: "Detail",
  background: "Background",
};

/** A paraphrase long enough to hold names, numbers and hedges, short enough to stay a claim. */
export const CLAIM_MAX = 800;
export const QUESTION_MAX = 500;
/** The most questions a project can usefully carry; the extraction prompt lists them all. */
export const QUESTION_LIMIT = 12;

// Research questions ----------------------------------------------------------

export interface ResearchQuestion {
  id: string;
  projectId: string;
  position: number;
  question: string;
  /** "Q1" — see questionLabels(). */
  label: string;
  archivedAt: string | null;
  /** Non-rejected data points that answer it. */
  dataPointCount: number;
}

interface QuestionOrderRow {
  id: string;
  position: number;
  createdAt: string;
}

/** Position, then creation time, then id — the one order a project's questions are listed and numbered in. */
export function compareQuestions(a: QuestionOrderRow, b: QuestionOrderRow): number {
  return (
    a.position - b.position || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

/**
 * "Q1", "Q2"… by rank among *all* of a project's questions, archived included.
 * Archiving one therefore leaves a gap (Q1, Q3) instead of silently renumbering
 * the questions every earlier data point was tagged with; only reordering moves
 * a label.
 */
export function questionLabels(questions: readonly QuestionOrderRow[]): Map<string, string> {
  const labels = new Map<string, string>();
  [...questions].sort(compareQuestions).forEach((question, index) => {
    labels.set(question.id, `Q${index + 1}`);
  });
  return labels;
}

/**
 * New positions after moving one question a step. Positions are renumbered
 * 0..n-1 over the whole list so repeated moves never tie. Null when the move
 * would leave the list (first up, last down) or the id is unknown.
 */
export function reorderQuestionIds(
  orderedIds: readonly string[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const index = orderedIds.indexOf(id);
  if (index === -1) return null;
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= orderedIds.length) return null;
  const next = [...orderedIds];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/**
 * The whole list's new order after moving an *active* question a step past its
 * nearest active neighbour. Archived questions keep their slots, so restoring
 * one later puts it back roughly where it was. Null when it can't move.
 */
export function moveAmongActive(
  ordered: readonly { id: string; archived: boolean }[],
  id: string,
  direction: "up" | "down",
): string[] | null {
  const activeIds = ordered.filter((question) => !question.archived).map((question) => question.id);
  const reordered = reorderQuestionIds(activeIds, id, direction);
  if (!reordered) return null;
  let next = 0;
  return ordered.map((question) => (question.archived ? question.id : reordered[next++]!));
}

// Background notes --------------------------------------------------------------

export interface ContextNote {
  id: string;
  projectId: string;
  title: string;
  summary: string;
  url: string;
  /** The site the note came from ("nps.gov"), derived from the url. */
  sourceName: string;
  retrievedAt: string;
  status: "active" | "dismissed";
}

/** "https://www.nps.gov/pere/fort.htm" → "nps.gov". Empty for something that is not a URL. */
export function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// Data points -------------------------------------------------------------------------

export type DataPointSpan =
  | { kind: "temporal"; startMs: number; endMs: number }
  | {
      kind: "document";
      pageNumber: number;
      firstBlockId: string | null;
      lastBlockId: string | null;
    };

export interface DataPoint {
  id: string;
  projectId: string;
  sourceId: string;
  representationId: string;
  questionId: string | null;
  relevance: DataPointRelevance;
  storyElement: StoryElement | null;
  claim: string;
  aiClaim: string;
  speakerId: string | null;
  kind: DataPointKind;
  status: DataPointStatus;
  promptVersionId: string | null;
  spans: DataPointSpan[];
}

/**
 * The small grey tag on a card: "Firsthand · Q1" for a point that answers a
 * question, "Firsthand · Story · Place" for one that does not. The card's CSS
 * upper-cases it.
 */
export function dataPointTag(
  point: Pick<DataPoint, "kind" | "relevance" | "storyElement" | "questionId">,
  labels: ReadonlyMap<string, string>,
): string {
  const kind = KIND_LABEL[point.kind];
  if (point.relevance === "story") {
    return point.storyElement
      ? `${kind} · Story · ${STORY_ELEMENT_LABEL[point.storyElement]}`
      : `${kind} · Story`;
  }
  const label = point.questionId ? labels.get(point.questionId) : undefined;
  return label ? `${kind} · ${label}` : kind;
}

/**
 * What a data point answers, as a short label: "Q1" for a point that answers a
 * question, "Story" for one that adds to the story, null when neither is known
 * (its question was removed). Where a surface has no room for the full tag.
 */
export function pointQuestionLabel(
  point: Pick<DataPoint, "relevance" | "questionId">,
  labels: ReadonlyMap<string, string>,
): string | null {
  if (point.relevance === "story") return "Story";
  return point.questionId ? (labels.get(point.questionId) ?? null) : null;
}

/** The hover text for a question label: "Q1 — the question as worded". */
export function questionTitle(
  point: Pick<DataPoint, "relevance" | "questionId">,
  labels: ReadonlyMap<string, string>,
  texts: ReadonlyMap<string, string>,
): string | undefined {
  if (point.relevance === "story") return "Adds to the story rather than answering a question";
  if (!point.questionId) return undefined;
  const label = labels.get(point.questionId);
  const text = texts.get(point.questionId);
  return label && text ? `${label} — ${text}` : undefined;
}

/**
 * "13:02–13:11" for one stretch, "12:41–12:58 · 13:06–13:09 · 2 spans" for a
 * memory built from two; "p. 3" / "pp. 3–4" for a document.
 */
export function formatSpans(spans: readonly DataPointSpan[]): string {
  if (spans.length === 0) return "";
  const first = spans[0]!;
  if (first.kind === "document") {
    const pages = [
      ...new Set(spans.filter((span) => span.kind === "document").map((span) => span.pageNumber)),
    ].sort((a, b) => a - b);
    const low = pages[0]!;
    const high = pages[pages.length - 1]!;
    return low === high ? `p. ${low}` : `pp. ${low}–${high}`;
  }
  const times = spans
    .filter((span) => span.kind === "temporal")
    .map((span) => `${formatDuration(span.startMs)}–${formatDuration(span.endMs)}`);
  return spans.length > 1 ? `${times.join(" · ")} · ${spans.length} spans` : times[0]!;
}

/** Where on the recording the point starts — what a card's play button and a phone's "open in transcript" seek to. */
export function firstStartMs(spans: readonly DataPointSpan[]): number | null {
  const times = spans.filter((span) => span.kind === "temporal").map((span) => span.startMs);
  return times.length === 0 ? null : Math.min(...times);
}

// Review ------------------------------------------------------------------------------------

export type DataPointFilter = "to_review" | "all" | "story" | "rejected";

export interface ReviewCounts {
  total: number;
  toReview: number;
  accepted: number;
  rejected: number;
  story: number;
}

/** The numbers on the rail's filter chips, from the points the screen already holds. */
export function reviewCounts(
  points: readonly Pick<DataPoint, "status" | "relevance">[],
): ReviewCounts {
  let toReview = 0;
  let accepted = 0;
  let rejected = 0;
  let story = 0;
  for (const point of points) {
    if (point.status === "suggested") toReview += 1;
    else if (point.status === "accepted") accepted += 1;
    else rejected += 1;
    if (point.status !== "rejected" && point.relevance === "story") story += 1;
  }
  return { total: toReview + accepted, toReview, accepted, rejected, story };
}

/** Which points a chip shows, in document order (the caller passes them in span order). */
export function filterDataPoints<T extends Pick<DataPoint, "status" | "relevance">>(
  points: readonly T[],
  filter: DataPointFilter,
): T[] {
  switch (filter) {
    case "to_review":
      return points.filter((point) => point.status === "suggested");
    case "story":
      return points.filter((point) => point.status !== "rejected" && point.relevance === "story");
    case "rejected":
      return points.filter((point) => point.status === "rejected");
    case "all":
      return points.filter((point) => point.status !== "rejected");
  }
}

/** The chip a source opens on: what needs a decision, else everything. */
export function defaultDataPointFilter(counts: Pick<ReviewCounts, "toReview">): DataPointFilter {
  return counts.toReview > 0 ? "to_review" : "all";
}

/** Points ordered as they occur in the source — by first span, then id. */
export function sortDataPointsBySpan<T extends Pick<DataPoint, "spans" | "id">>(
  points: readonly T[],
): T[] {
  const key = (point: T): number => {
    const first = point.spans[0];
    if (!first) return Number.MAX_SAFE_INTEGER;
    return first.kind === "temporal" ? first.startMs : first.pageNumber * 1_000_000;
  };
  return [...points].sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
}
