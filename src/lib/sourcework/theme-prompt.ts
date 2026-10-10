// What the two theme steps give the model and what it may return: the fixed
// framing (code owns structure, docs/sourcework-analysis-design.md §2.6), each
// step's input, its strict output schema, and the parsers that turn an answer
// into assignments, proposed themes and merge suggestions. Pure.
//
// The editors' wording — what a good theme definition reads like, when a point
// "complicates" rather than "supports" — is a separate piece of language
// appended to the framing (lib/sourcework/prompts.ts); it cannot change the
// shape of the output. As with extraction, the model points at data points by
// number and never retypes one: code resolves the numbers to ids.

import { collapseWhitespace } from "@/lib/text";
import { validateThemeText, type Stance } from "./themes";

export const MAX_NEW_THEMES = 8;
export const MAX_MERGES = 5;
/** A theme needs more than one data point behind it before it is worth proposing. */
export const MIN_THEME_MEMBERS = 2;
/** Data points filed per assignment call; the candidate themes are repeated in each. */
export const ASSIGN_BATCH = 25;
/** Data points read per Review themes call. */
export const REVIEW_POOL_LIMIT = 250;
/** Accepted themes at or below this are all offered as candidates; above, the nearest by embedding. */
export const NARROW_ABOVE = 5;
/** Nearest themes taken per data point when narrowing. */
export const NEAREST_K = 5;
/** Candidates offered to a batch when narrowing is not available. */
export const CANDIDATE_CAP = 12;

const STANCES = ["supports", "complicates"] as const;

// Assignment ---------------------------------------------------------------------------

export const ASSIGNMENT_FRAMING = `You file a research project's accepted data points into its existing themes.

A theme is a claim, not a topic: its definition says something that the project's sources may bear out. A data point is a short paraphrase of what one source says. You are given a numbered list of candidate themes and a numbered list of data points.

For every data point, say which themes it bears on:
- "supports" when the data point is evidence for the theme's claim.
- "complicates" when it is evidence that qualifies, limits or contradicts the claim. Complicating evidence is kept beside the supporting evidence, so report it; do not hide a point because it disagrees.
- A data point may bear on several themes, or on none. Return an empty list for one that fits none of them.

Shared subject matter is not fit. A point about the same place or the same people as a theme, but saying nothing for or against what the theme claims, fits no theme. When in doubt, leave it out: an unfiled data point is looked at again, a wrongly filed one is easy to miss.

Refer to themes and data points only by their numbers. Never copy or retype their text. The newsroom's editors give their guidance below.`;

export interface AssignThemeInput {
  number: number;
  title: string;
  definition: string;
}

export interface AssignPointInput {
  number: number;
  claim: string;
  sourceTitle: string;
  speaker: string | null;
  kind: string;
  /** "Q2", or null for a story point. */
  questionLabel: string | null;
}

export function buildAssignmentInput(input: {
  projectTitle: string;
  themes: readonly AssignThemeInput[];
  points: readonly AssignPointInput[];
}): string {
  return [
    `Project: ${input.projectTitle}`,
    "Candidate themes:\n" +
      input.themes
        .map((theme) => `${theme.number}. ${theme.title} — ${theme.definition}`)
        .join("\n"),
    "Data points to file:\n" + input.points.map(renderPoint).join("\n"),
  ].join("\n\n");
}

function renderPoint(point: AssignPointInput): string {
  const tags = [
    point.sourceTitle,
    point.speaker,
    point.kind,
    point.questionLabel ? `answers ${point.questionLabel}` : "story material",
  ].filter(Boolean);
  return `${point.number}. [${tags.join(" · ")}] ${point.claim}`;
}

export function buildAssignmentOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["assignments"],
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["point_number", "fits"],
          properties: {
            point_number: { type: "integer" },
            fits: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["theme_number", "stance"],
                properties: {
                  theme_number: { type: "integer" },
                  stance: { type: "string", enum: [...STANCES] },
                },
              },
            },
          },
        },
      },
    },
  };
}

export type AssignDropReason = "unreadable" | "unknown_point" | "unknown_theme" | "bad_stance";

export interface ParsedAssignment {
  /** 0-based indexes into the caller's point and theme lists. */
  assignments: { pointIndex: number; themeIndex: number; stance: Stance }[];
  /** Points the model answered for and placed nowhere. */
  noFit: number[];
  dropped: Record<AssignDropReason, number>;
}

function emptyAssignDropped(): Record<AssignDropReason, number> {
  return { unreadable: 0, unknown_point: 0, unknown_theme: 0, bad_stance: 0 };
}

/**
 * Reads the model's JSON into assignments. A number the lists don't have is
 * dropped rather than clamped, so a stray "theme 7" can never land a point in
 * theme 6; a point named twice keeps its first answer.
 */
export function parseAssignmentOutput(
  raw: string,
  counts: { points: number; themes: number },
): ParsedAssignment {
  const dropped = emptyAssignDropped();
  const result: ParsedAssignment = { assignments: [], noFit: [], dropped };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropped.unreadable += 1;
    return result;
  }
  const items = (parsed as { assignments?: unknown } | null)?.assignments;
  if (!Array.isArray(items)) {
    dropped.unreadable += 1;
    return result;
  }

  const answered = new Set<number>();
  for (const item of items) {
    const row = item as { point_number?: unknown; fits?: unknown } | null;
    const number = row?.point_number;
    if (!Number.isInteger(number) || (number as number) < 1 || (number as number) > counts.points) {
      dropped.unknown_point += 1;
      continue;
    }
    const pointIndex = (number as number) - 1;
    if (answered.has(pointIndex)) continue;
    answered.add(pointIndex);

    const seen = new Set<number>();
    let placed = 0;
    for (const fit of Array.isArray(row?.fits) ? row.fits : []) {
      const themeNumber = (fit as { theme_number?: unknown } | null)?.theme_number;
      const stance = (fit as { stance?: unknown } | null)?.stance;
      if (
        !Number.isInteger(themeNumber) ||
        (themeNumber as number) < 1 ||
        (themeNumber as number) > counts.themes
      ) {
        dropped.unknown_theme += 1;
        continue;
      }
      if (stance !== "supports" && stance !== "complicates") {
        dropped.bad_stance += 1;
        continue;
      }
      const themeIndex = (themeNumber as number) - 1;
      if (seen.has(themeIndex)) continue;
      seen.add(themeIndex);
      result.assignments.push({ pointIndex, themeIndex, stance });
      placed += 1;
    }
    if (placed === 0) result.noFit.push(pointIndex);
  }
  return result;
}

/**
 * Which themes a batch of points is checked against. With few accepted themes
 * every one is a candidate. Above that, the union of each point's nearest
 * themes by embedding — but only when every point has some, so a point with no
 * embedding is never silently checked against nothing; otherwise the first
 * CANDIDATE_CAP themes in the order given (the caller orders broadest first).
 */
export function chooseCandidateThemes<T extends { id: string }>(args: {
  themes: readonly T[];
  nearestByPoint: ReadonlyMap<string, readonly string[]>;
  pointIds: readonly string[];
}): T[] {
  const { themes, nearestByPoint, pointIds } = args;
  if (themes.length <= NARROW_ABOVE) return [...themes];
  const everyPointHasNeighbours = pointIds.every((id) => (nearestByPoint.get(id)?.length ?? 0) > 0);
  if (everyPointHasNeighbours) {
    const wanted = new Set(pointIds.flatMap((id) => nearestByPoint.get(id) ?? []));
    const narrowed = themes.filter((theme) => wanted.has(theme.id));
    if (narrowed.length > 0) return narrowed.slice(0, CANDIDATE_CAP);
  }
  return themes.slice(0, CANDIDATE_CAP);
}

// Review themes ----------------------------------------------------------------------------

export const REVIEW_FRAMING = `You review a research project's data points and propose themes.

A theme is a claim, not a topic. "Childhood" is a topic; "Locals treated the fort's tunnels as a private playground" is a theme: one sentence that several of the project's sources bear out, or push against. You are given:
- the project's research questions,
- its accepted themes (numbered T1, T2…), which are settled: you never reword them,
- themes already proposed or turned down, which you do not propose again,
- a numbered list of accepted data points that sit in no theme yet.

Return two things.

new_themes: themes the unfiled data points show. Each has a title that is a short statement, a definition of one sentence that says what it claims, and the data points behind it by number, each marked "supports" or "complicates" the claim. A theme needs at least two data points. Prefer a theme that several different sources or speakers bear on; a theme resting on one source is allowed, because the reporter sees that it does, but do not pad one out. Evidence that complicates a theme belongs in it, marked as such. A data point may sit in more than one theme. Do not propose a theme the accepted ones already cover: if the unfiled points belong to an accepted theme, say nothing and they will be filed there.

merges: pairs of accepted themes that say the same thing in different words, by their T numbers: from_theme_number is folded into into_theme_number. Give a one-sentence reason. Suggest a merge only when the two would be one claim; related is not the same.

Refer to data points and themes only by number. Never copy or retype their text. Return nothing rather than something weak. The newsroom's editors give their guidance below.`;

export interface ReviewQuestionInput {
  label: string;
  question: string;
}

export interface ReviewThemeInput {
  number: number;
  title: string;
  definition: string;
  sources: number;
}

export function buildReviewInput(input: {
  projectTitle: string;
  projectDescription: string | null;
  projectSources: number;
  questions: readonly ReviewQuestionInput[];
  acceptedThemes: readonly ReviewThemeInput[];
  /** Titles of themes already proposed or declined, so they are not proposed again. */
  settledTitles: readonly string[];
  points: readonly AssignPointInput[];
}): string {
  const parts: string[] = [`Project: ${input.projectTitle}`];
  if (input.projectDescription?.trim()) parts.push(collapseWhitespace(input.projectDescription));
  parts.push(
    `The project has ${input.projectSources} source${input.projectSources === 1 ? "" : "s"}.`,
  );

  if (input.questions.length > 0) {
    parts.push(
      "Research questions:\n" +
        input.questions.map((question) => `${question.label}. ${question.question}`).join("\n"),
    );
  }
  parts.push(
    input.acceptedThemes.length > 0
      ? "Accepted themes:\n" +
          input.acceptedThemes
            .map(
              (theme) =>
                `T${theme.number}. ${theme.title} — ${theme.definition} (${theme.sources} source${theme.sources === 1 ? "" : "s"})`,
            )
            .join("\n")
      : "Accepted themes: none yet.",
  );
  if (input.settledTitles.length > 0) {
    parts.push(
      "Already proposed or turned down (do not propose again):\n" +
        input.settledTitles.map((title) => `- ${title}`).join("\n"),
    );
  }
  parts.push("Data points that sit in no theme yet:\n" + input.points.map(renderPoint).join("\n"));
  return parts.join("\n\n");
}

export function buildReviewOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["new_themes", "merges"],
    properties: {
      new_themes: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "definition", "members"],
          properties: {
            title: { type: "string" },
            definition: { type: "string" },
            members: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["point_number", "stance"],
                properties: {
                  point_number: { type: "integer" },
                  stance: { type: "string", enum: [...STANCES] },
                },
              },
            },
          },
        },
      },
      merges: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["from_theme_number", "into_theme_number", "reason"],
          properties: {
            from_theme_number: { type: "integer" },
            into_theme_number: { type: "integer" },
            reason: { type: "string" },
          },
        },
      },
    },
  };
}

export type ReviewDropReason =
  | "unreadable"
  | "bad_text"
  | "duplicate_title"
  | "too_few_points"
  | "bad_merge"
  | "duplicate_merge";

export interface ProposedTheme {
  title: string;
  definition: string;
  members: { pointIndex: number; stance: Stance }[];
}

export interface ProposedMerge {
  /** 0-based indexes into the accepted themes the caller listed. */
  fromIndex: number;
  intoIndex: number;
  reason: string;
}

export interface ParsedReview {
  themes: ProposedTheme[];
  merges: ProposedMerge[];
  dropped: Record<ReviewDropReason, number>;
}

export function emptyReviewDropped(): Record<ReviewDropReason, number> {
  return {
    unreadable: 0,
    bad_text: 0,
    duplicate_title: 0,
    too_few_points: 0,
    bad_merge: 0,
    duplicate_merge: 0,
  };
}

/** Two titles that differ only in case, spacing or punctuation are the same title. */
export function normalizeTitle(title: string): string {
  return collapseWhitespace(title)
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const REASON_MAX = 500;

/**
 * Reads the model's JSON into proposals, dropping — and counting — what can't be
 * trusted: a theme with no statement, one already on file, one resting on fewer
 * than two real data points, a merge between themes the list doesn't have or
 * of a theme with itself. `existing` is every title already on file
 * (accepted, proposed or turned down), so a re-run cannot re-propose one.
 */
export function parseReviewOutput(
  raw: string,
  context: {
    pointCount: number;
    acceptedThemeCount: number;
    existingTitles: readonly string[];
    /** Pairs already suggested, as "fromIndex:intoIndex" — in either direction. */
    existingMergePairs?: ReadonlySet<string>;
  },
): ParsedReview {
  const dropped = emptyReviewDropped();
  const result: ParsedReview = { themes: [], merges: [], dropped };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropped.unreadable += 1;
    return result;
  }
  const body = parsed as { new_themes?: unknown; merges?: unknown } | null;
  if (!Array.isArray(body?.new_themes) || !Array.isArray(body?.merges)) {
    dropped.unreadable += 1;
    return result;
  }

  const taken = new Set(context.existingTitles.map(normalizeTitle));
  for (const item of body.new_themes) {
    if (result.themes.length >= MAX_NEW_THEMES) break;
    const row = item as { title?: unknown; definition?: unknown; members?: unknown } | null;
    const text = validateThemeText({ title: row?.title, definition: row?.definition });
    if (!text.ok) {
      dropped.bad_text += 1;
      continue;
    }
    const key = normalizeTitle(text.title);
    if (taken.has(key)) {
      dropped.duplicate_title += 1;
      continue;
    }

    const members = new Map<number, Stance>();
    for (const member of Array.isArray(row?.members) ? row.members : []) {
      const number = (member as { point_number?: unknown } | null)?.point_number;
      const stance = (member as { stance?: unknown } | null)?.stance;
      if (
        !Number.isInteger(number) ||
        (number as number) < 1 ||
        (number as number) > context.pointCount
      ) {
        continue;
      }
      if (stance !== "supports" && stance !== "complicates") continue;
      const index = (number as number) - 1;
      if (!members.has(index)) members.set(index, stance);
    }
    if (members.size < MIN_THEME_MEMBERS) {
      dropped.too_few_points += 1;
      continue;
    }

    taken.add(key);
    result.themes.push({
      title: text.title,
      definition: text.definition,
      members: [...members.entries()].map(([pointIndex, stance]) => ({ pointIndex, stance })),
    });
  }

  const pairs = new Set(context.existingMergePairs ?? []);
  for (const item of body.merges) {
    if (result.merges.length >= MAX_MERGES) break;
    const row = item as {
      from_theme_number?: unknown;
      into_theme_number?: unknown;
      reason?: unknown;
    } | null;
    const from = row?.from_theme_number;
    const into = row?.into_theme_number;
    const valid = (value: unknown): value is number =>
      Number.isInteger(value) &&
      (value as number) >= 1 &&
      (value as number) <= context.acceptedThemeCount;
    const reason = typeof row?.reason === "string" ? collapseWhitespace(row.reason) : "";
    if (!valid(from) || !valid(into) || from === into || reason === "") {
      dropped.bad_merge += 1;
      continue;
    }
    const forward = `${from - 1}:${into - 1}`;
    const backward = `${into - 1}:${from - 1}`;
    if (pairs.has(forward) || pairs.has(backward)) {
      dropped.duplicate_merge += 1;
      continue;
    }
    pairs.add(forward);
    result.merges.push({
      fromIndex: from - 1,
      intoIndex: into - 1,
      reason: reason.length > REASON_MAX ? `${reason.slice(0, REASON_MAX - 1).trimEnd()}…` : reason,
    });
  }

  return result;
}
