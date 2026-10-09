// What the extraction model is given and what it may return: the fixed framing
// (code owns structure, §2.6), the per-source input, the strict output schema,
// and the parser that turns an answer into candidate data points. Pure.
//
// The editors' wording — what counts as responsive, what a "place" is, how to
// phrase a claim — is a separate piece of language appended to the framing
// (lib/sourcework/prompts.ts); it cannot change the shape of the output.

import { collapseWhitespace } from "@/lib/text";
import {
  CLAIM_MAX,
  DATA_POINT_KINDS,
  STORY_ELEMENTS,
  type DataPointKind,
  type DataPointRelevance,
  type StoryElement,
} from "./research";
import {
  MAX_SPAN_UNITS,
  mergeRanges,
  renderUnits,
  unitIdsOf,
  type ExtractionGroup,
  type ExtractionUnit,
  type UnitRange,
} from "./extraction-units";

export const EXTRACTION_FRAMING = `You read one source for a radio newsroom's research project and extract data points: short paraphrases of what the source says that bear on the project's research questions, or that a producer would want for a story.

The source arrives as numbered units — sentences of a transcript, or blocks of a document — under headers that name the speaker and time, or the page. You point at passages only by unit number. You never copy or retype source text.

Return every data point as:
- relevance: "question" with question_number (the number from the list of research questions) when it bears on one of them, or "story" with a story_element when it answers none of them but a producer would want it. For a "question" point story_element is null; for a "story" point question_number is null. A passage that answers two questions is two data points.
- kind: "firsthand" when the speaker lived or did it themselves; "secondhand" when they heard it from someone else; "opinion" for their view or judgment; "factual" for a statement of record such as a date, number or institution.
- claim: a short paraphrase in plain words that keeps the names, places, numbers, dates and hedges the speaker used ("as a kid, he thinks, around 1960"). It is not a topic label and not a quote.
- spans: one or more ranges of unit numbers (from_unit to to_unit, inclusive) that the claim rests on. Use a second range only when the claim is built from passages that are not next to each other. Keep each range as tight as the claim allows.

Background notes, when given, are unverified web material. Use them only to read names and terms correctly. They are never evidence: every claim must rest on the source's own units.

If nothing in the source qualifies, return an empty list. Do not invent. The newsroom's editors give their guidance below.`;

export interface ExtractionQuestion {
  /** 1-based, the number the model uses. */
  number: number;
  question: string;
}

export interface ExtractionNote {
  title: string;
  summary: string;
}

export interface ExtractionInput {
  projectTitle: string;
  projectDescription: string | null;
  questions: readonly ExtractionQuestion[];
  notes: readonly ExtractionNote[];
  sourceTitle: string;
  sourceKindLabel: string;
  units: readonly ExtractionUnit[];
  groups: readonly ExtractionGroup[];
  /** "Part 2 of 3" when the source is read in windows. */
  windowLabel: string | null;
}

/** The user message for one window of one source. */
export function buildExtractionInput(input: ExtractionInput): string {
  const parts: string[] = [`Project: ${input.projectTitle}`];
  if (input.projectDescription?.trim()) parts.push(collapseWhitespace(input.projectDescription));

  parts.push(
    "Research questions:\n" +
      input.questions.map((question) => `${question.number}. ${question.question}`).join("\n"),
  );

  if (input.notes.length > 0) {
    parts.push(
      "Background notes (unverified web reference, not evidence):\n" +
        input.notes.map((note) => `- ${note.title}: ${note.summary}`).join("\n"),
    );
  }

  parts.push(
    `Source: ${input.sourceTitle} (${input.sourceKindLabel})` +
      (input.windowLabel ? ` — ${input.windowLabel}` : ""),
  );
  parts.push(renderUnits(input.units, input.groups));
  return parts.join("\n\n");
}

/** The strict JSON shape the model must answer in. */
export function buildExtractionOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["data_points"],
    properties: {
      data_points: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["relevance", "question_number", "story_element", "kind", "claim", "spans"],
          properties: {
            relevance: { type: "string", enum: ["question", "story"] },
            question_number: { type: ["integer", "null"] },
            story_element: { type: ["string", "null"], enum: [...STORY_ELEMENTS, null] },
            kind: { type: "string", enum: [...DATA_POINT_KINDS] },
            claim: { type: "string" },
            spans: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["from_unit", "to_unit"],
                properties: {
                  from_unit: { type: "integer" },
                  to_unit: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  };
}

// Parsing -------------------------------------------------------------------------

export type DropReason =
  | "unreadable"
  | "bad_relevance"
  | "unknown_question"
  | "empty_claim"
  | "claim_too_long"
  | "no_valid_span";

export interface CandidatePoint {
  relevance: DataPointRelevance;
  questionId: string | null;
  /** Equal for two points that bear on the same question (or both on the story). */
  questionKey: string | null;
  storyElement: StoryElement | null;
  kind: DataPointKind;
  claim: string;
  ranges: UnitRange[];
  unitIds: Set<number>;
}

export interface ParsedExtraction {
  points: CandidatePoint[];
  dropped: Record<DropReason, number>;
}

function emptyDropped(): Record<DropReason, number> {
  return {
    unreadable: 0,
    bad_relevance: 0,
    unknown_question: 0,
    empty_claim: 0,
    claim_too_long: 0,
    no_valid_span: 0,
  };
}

/**
 * Reads the model's JSON into candidate points, dropping — and counting — what
 * can't be trusted: a claim with no question it names, no words, or no passage
 * it truly points at. A range naming a unit this window doesn't have is dropped
 * rather than clamped, since clamping would quietly move the evidence.
 */
export function parseExtractionOutput(
  raw: string,
  context: { questionIds: readonly string[]; validUnitIds: ReadonlySet<number> },
): ParsedExtraction {
  const dropped = emptyDropped();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropped.unreadable += 1;
    return { points: [], dropped };
  }

  const items = (parsed as { data_points?: unknown } | null)?.data_points;
  if (!Array.isArray(items)) {
    dropped.unreadable += 1;
    return { points: [], dropped };
  }

  const points: CandidatePoint[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") {
      dropped.unreadable += 1;
      continue;
    }
    const row = item as Record<string, unknown>;

    const relevance = row.relevance;
    if (relevance !== "question" && relevance !== "story") {
      dropped.bad_relevance += 1;
      continue;
    }

    let questionId: string | null = null;
    let storyElement: StoryElement | null = null;
    if (relevance === "question") {
      const number = row.question_number;
      questionId =
        typeof number === "number" && Number.isInteger(number)
          ? (context.questionIds[number - 1] ?? null)
          : null;
      if (!questionId) {
        dropped.unknown_question += 1;
        continue;
      }
    } else {
      const element = row.story_element;
      if (typeof element !== "string" || !(STORY_ELEMENTS as readonly string[]).includes(element)) {
        dropped.bad_relevance += 1;
        continue;
      }
      storyElement = element as StoryElement;
    }

    const kind = row.kind;
    if (typeof kind !== "string" || !(DATA_POINT_KINDS as readonly string[]).includes(kind)) {
      dropped.unreadable += 1;
      continue;
    }

    const claim = typeof row.claim === "string" ? collapseWhitespace(row.claim) : "";
    if (claim === "") {
      dropped.empty_claim += 1;
      continue;
    }
    if (claim.length > CLAIM_MAX) {
      dropped.claim_too_long += 1;
      continue;
    }

    const ranges: UnitRange[] = [];
    if (Array.isArray(row.spans)) {
      for (const span of row.spans) {
        const from = (span as { from_unit?: unknown } | null)?.from_unit;
        const to = (span as { to_unit?: unknown } | null)?.to_unit;
        if (!Number.isInteger(from) || !Number.isInteger(to)) continue;
        // A reversed pair is a slip of the pen, not a different passage.
        const low = Math.min(from as number, to as number);
        const high = Math.max(from as number, to as number);
        if (high - low + 1 > MAX_SPAN_UNITS) continue;
        if (!context.validUnitIds.has(low) || !context.validUnitIds.has(high)) continue;
        // Every unit between the ends must exist too (a window never has holes, but be sure).
        let whole = true;
        for (let id = low; id <= high; id++) {
          if (!context.validUnitIds.has(id)) {
            whole = false;
            break;
          }
        }
        if (whole) ranges.push({ from: low, to: high });
      }
    }
    if (ranges.length === 0) {
      dropped.no_valid_span += 1;
      continue;
    }

    const merged = mergeRanges(ranges);
    points.push({
      relevance,
      questionId,
      questionKey: relevance === "question" ? questionId : null,
      storyElement,
      kind: kind as DataPointKind,
      claim,
      ranges: merged,
      unitIds: unitIdsOf(merged),
    });
  }

  return { points, dropped };
}

/** Adds one parse's drop counts into a running total. */
export function sumDropped(
  total: Record<DropReason, number>,
  more: Record<DropReason, number>,
): Record<DropReason, number> {
  const result = { ...total };
  for (const key of Object.keys(more) as DropReason[]) result[key] += more[key];
  return result;
}

export { emptyDropped };
