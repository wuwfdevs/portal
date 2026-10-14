// Analyze source (docs/sourcework-analysis-design.md §20): what the model is given for one source,
// what it may return, and the checks on what comes back. Pure.
//
// One run reads a source and returns three things: findings (what the source establishes,
// sharpens or complicates for the project's questions), a few candidate clips, and the web pages
// that changed how the model read it. The framing states one objective and a few principles;
// structure is enforced here, in the schema and the parser, not by asking nicely. As everywhere in
// this feature the model points at passages by unit number and never types source text, a time or
// a quote: code derives the times and the words.
//
// What counts as a good finding and a good clip is separate language editors own
// (lib/sourcework/prompts.ts, the `analyze` slot); it is appended to this framing and cannot
// change the shape of the answer.

import { collapseWhitespace } from "@/lib/text";
import { CLAIM_MAX, DATA_POINT_KINDS, hostLabel, type DataPointKind } from "./research";
import {
  MAX_SPAN_UNITS,
  dropOverlapping,
  mergeRanges,
  renderUnits,
  unitIdsOf,
  type ExtractionGroup,
  type ExtractionUnit,
  type UnitRange,
} from "./extraction-units";
import { MAX_QUOTE_MS, MIN_QUOTE_MS, sameStretch } from "./quotes";

/** The most candidate clips one source yields. A ceiling, not a target: none is a normal answer. */
export const MAX_ANALYZE_EXCERPTS = 5;
/** Findings already established that are shown to the model, so a long project does not crowd the source out. */
export const MAX_ESTABLISHED_FINDINGS = 150;
export const SIGNIFICANCE_MAX = 400;
export const EXCERPT_WHY_MAX = 600;
/** Pages the model may list as consulted, per window. */
export const MAX_CONSULTED = 8;
export const NOTE_TITLE_MAX = 200;
export const NOTE_SUMMARY_MAX = 600;

/** What makes two notes the same subject. */
export function noteKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export const ANALYZE_FRAMING = `You are a research collaborator for a public radio newsroom. A reporter has given you one source and wants to know what in it matters: what it establishes, sharpens or complicates for the project's research questions, and the few passages that would work as audio on the air.

Read the way a reporter would. When something in the source depends on context you don't have, such as an unfamiliar place, institution, term, event or claim, search the web, then return to the source with that understanding. Search when it will change how you read the source, not by routine. Never put the name of an interviewee or a private individual in a search. What you learn from the web informs your reading; it never becomes a finding. Every finding rests on what this source itself says.

The source arrives as numbered units (sentences of a transcript, or blocks of a document) under headers naming the speaker and the time, or the page. Point at passages only by unit number. Never copy or retype source text. What an interviewer says is a question, not a finding or a clip.

Be selective. A finding earns its place by what it adds to what the project has already established: something new, more precise, better sourced, firsthand where the record was secondhand, or in tension with it. Leave out what repeats an established finding, what is tangential to the questions, what could be said of any storm or any town, and what is merely interesting. Fewer, better findings are the goal; an empty list is a valid answer.

Return:
- findings: each with question_number (null when it answers none of the questions, or the project has none), kind (firsthand: the speaker lived or did it; secondhand: they heard it; opinion: their view; factual: a statement of record), claim (a short paraphrase in plain words that keeps the names, places, numbers, dates and hedges the speaker used; not a topic label, not a quote), significance (one sentence on what this adds), and spans (ranges of unit numbers it rests on, as tight as the claim allows).
- excerpts: passages that would work as audio because they do something narration can't: a voice, an experience, a revealing detail or turn of phrase, an explanation only this speaker can give. One speaker's consecutive sentences (first_unit to last_unit) that make sense on their own. Give why in one sentence, and finding_number for the finding it serves, or null for a moment of character or narrative detail that serves none. Judge clips by how they would sound on the air, not by whether they answer a research question: a strong moment that serves no question is still a clip (finding_number null). Choose few. None is a normal answer; never add a weaker clip to reach a number.
- consulted: the web pages that changed how you read the source: a title, one or two sentences on what the page told you, its address copied from a search result (never invented), and finding_numbers for the findings it informed. List only pages you relied on.

The newsroom's editors give their guidance below.`;

export interface AnalyzeQuestion {
  /** 1-based, the number the model uses. */
  number: number;
  question: string;
}

export interface EstablishedFinding {
  /** "Q2", or null for a finding that answers no question. */
  questionLabel: string | null;
  claim: string;
  sourceTitle: string;
}

export interface AnalyzeNote {
  title: string;
  summary: string;
}

export interface AnalyzeInput {
  projectTitle: string;
  projectDescription: string | null;
  questions: readonly AnalyzeQuestion[];
  established: readonly EstablishedFinding[];
  /** Pages consulted on earlier runs and not dismissed; reference for reading the source, never evidence. */
  notes: readonly AnalyzeNote[];
  sourceTitle: string;
  sourceKindLabel: string;
  units: readonly ExtractionUnit[];
  groups: readonly ExtractionGroup[];
  /** "Part 2 of 3" when the source is read in windows. */
  windowLabel: string | null;
}

/** The user message for one window of one source. */
export function buildAnalyzeInput(input: AnalyzeInput): string {
  const parts: string[] = [`Project: ${input.projectTitle}`];
  if (input.projectDescription?.trim()) parts.push(collapseWhitespace(input.projectDescription));

  if (input.questions.length > 0) {
    parts.push(
      "Research questions:\n" +
        input.questions.map((question) => `${question.number}. ${question.question}`).join("\n"),
    );
  } else {
    parts.push(
      "This project has no research question yet. Use its title and description as the guide: what in this source would a reporter need to know, check or cite? Give every finding question_number null.",
    );
  }

  if (input.established.length > 0) {
    parts.push(
      "Already established in this project, from other sources. Do not repeat these. Add to them, sharpen them or contradict them:\n" +
        input.established
          .slice(0, MAX_ESTABLISHED_FINDINGS)
          .map(
            (finding) =>
              `- ${finding.questionLabel ? `${finding.questionLabel}: ` : ""}${finding.claim} [${finding.sourceTitle}]`,
          )
          .join("\n"),
    );
  }

  if (input.notes.length > 0) {
    parts.push(
      "Background from the web, gathered earlier. Unverified reference for reading names and terms; never evidence:\n" +
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
export function buildAnalyzeOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["findings", "excerpts", "consulted"],
    properties: {
      findings: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question_number", "kind", "claim", "significance", "spans"],
          properties: {
            question_number: { type: ["integer", "null"] },
            kind: { type: "string", enum: [...DATA_POINT_KINDS] },
            claim: { type: "string" },
            significance: { type: "string" },
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
      excerpts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["first_unit", "last_unit", "why", "finding_number"],
          properties: {
            first_unit: { type: "integer" },
            last_unit: { type: "integer" },
            why: { type: "string" },
            finding_number: { type: ["integer", "null"] },
          },
        },
      },
      consulted: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary", "url", "finding_numbers"],
          properties: {
            title: { type: "string" },
            summary: { type: "string" },
            url: { type: "string" },
            finding_numbers: { type: "array", items: { type: "integer" } },
          },
        },
      },
    },
  };
}

// Parsing -------------------------------------------------------------------------------------

export type AnalyzeDropReason =
  | "unreadable"
  | "unknown_question"
  | "empty_claim"
  | "claim_too_long"
  | "no_significance"
  | "no_valid_span"
  | "interviewer"
  | "clip_unknown_unit"
  | "clip_mixed_speakers"
  | "clip_no_time"
  | "clip_wrong_length"
  | "clip_no_reason"
  | "clip_duplicate"
  | "clip_over_limit"
  | "note_unusable";

export function emptyAnalyzeDropped(): Record<AnalyzeDropReason, number> {
  return {
    unreadable: 0,
    unknown_question: 0,
    empty_claim: 0,
    claim_too_long: 0,
    no_significance: 0,
    no_valid_span: 0,
    interviewer: 0,
    clip_unknown_unit: 0,
    clip_mixed_speakers: 0,
    clip_no_time: 0,
    clip_wrong_length: 0,
    clip_no_reason: 0,
    clip_duplicate: 0,
    clip_over_limit: 0,
    note_unusable: 0,
  };
}

export function sumAnalyzeDropped(
  total: Record<AnalyzeDropReason, number>,
  more: Record<AnalyzeDropReason, number>,
): Record<AnalyzeDropReason, number> {
  const result = { ...total };
  for (const key of Object.keys(more) as AnalyzeDropReason[]) result[key] += more[key];
  return result;
}

export interface AnalyzeFinding {
  questionId: string | null;
  relevance: "question" | "general";
  /** Equal for two findings that bear on the same question (or both on none). */
  questionKey: string | null;
  kind: DataPointKind;
  claim: string;
  significance: string;
  ranges: UnitRange[];
  unitIds: Set<number>;
}

export interface AnalyzeExcerpt {
  firstUnit: number;
  lastUnit: number;
  startMs: number;
  endMs: number;
  why: string;
  speakerId: string | null;
  /** The finding it serves; null for narrative colour that serves none. */
  serves: AnalyzeFinding | null;
}

export interface AnalyzeConsulted {
  title: string;
  summary: string;
  url: string;
  sourceName: string;
  informs: AnalyzeFinding[];
}

export interface ParsedAnalysis {
  findings: AnalyzeFinding[];
  excerpts: AnalyzeExcerpt[];
  consulted: AnalyzeConsulted[];
  dropped: Record<AnalyzeDropReason, number>;
}

export interface AnalyzeParseContext {
  /** The active questions' ids, in the order the model was shown them (number n is index n - 1). */
  questionIds: readonly string[];
  /** The units of this window. A range naming one outside it is dropped, not clamped. */
  validUnitIds: ReadonlySet<number>;
  unitsById: ReadonlyMap<number, ExtractionUnit>;
  /** Who speaks each transcript unit (a `tw_speakers` id). */
  speakerByUnit: ReadonlyMap<number, string | null>;
  /** Speakers a person marked as the interviewer. */
  interviewerSpeakerIds: ReadonlySet<string>;
  /** The pages the search tool returned or cited; null when the response exposed none. */
  seenUrls: ReadonlySet<string> | null;
}

function isInterviewerOnly(
  unitIds: Iterable<number>,
  context: Pick<AnalyzeParseContext, "speakerByUnit" | "interviewerSpeakerIds">,
): boolean {
  if (context.interviewerSpeakerIds.size === 0) return false;
  let any = false;
  for (const id of unitIds) {
    any = true;
    const speaker = context.speakerByUnit.get(id);
    if (!speaker || !context.interviewerSpeakerIds.has(speaker)) return false;
  }
  return any;
}

function truncateWords(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Reads the model's JSON into findings, clips and consulted pages, dropping — and counting —
 * what the code can't stand behind: a finding with no passage it truly points at, no words, no
 * "why it matters", or one that is only the interviewer; a clip that crosses speakers, runs
 * outside the length a quote can be, or names a sentence the model was not shown; a page the
 * search tool never returned. A range naming a unit this window doesn't have is dropped rather
 * than clamped, since clamping would quietly move the evidence.
 */
export function parseAnalysisOutput(raw: string, context: AnalyzeParseContext): ParsedAnalysis {
  const dropped = emptyAnalyzeDropped();
  const result: ParsedAnalysis = { findings: [], excerpts: [], consulted: [], dropped };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropped.unreadable += 1;
    return result;
  }
  const body = parsed as { findings?: unknown; excerpts?: unknown; consulted?: unknown } | null;
  if (!Array.isArray(body?.findings)) {
    dropped.unreadable += 1;
    return result;
  }

  // The model numbers its findings 1..n in the order it wrote them; a dropped one leaves a hole.
  const byNumber = new Map<number, AnalyzeFinding>();
  body.findings.forEach((item, index) => {
    const finding = readFinding(item, context, dropped);
    if (finding) {
      byNumber.set(index + 1, finding);
      result.findings.push(finding);
    }
  });

  if (Array.isArray(body.excerpts)) {
    const kept: AnalyzeExcerpt[] = [];
    for (const item of body.excerpts) {
      const excerpt = readExcerpt(item, context, byNumber, dropped);
      if (!excerpt) continue;
      if (kept.some((other) => sameStretch(other, excerpt))) {
        dropped.clip_duplicate += 1;
        continue;
      }
      kept.push(excerpt);
    }
    if (kept.length > MAX_ANALYZE_EXCERPTS) {
      dropped.clip_over_limit += kept.length - MAX_ANALYZE_EXCERPTS;
    }
    result.excerpts = kept.slice(0, MAX_ANALYZE_EXCERPTS);
  }

  if (Array.isArray(body.consulted)) {
    const seen = new Set<string>();
    for (const item of body.consulted) {
      if (result.consulted.length >= MAX_CONSULTED) break;
      const note = readConsulted(item, context, byNumber);
      if (!note || seen.has(noteKey(note.title))) {
        dropped.note_unusable += 1;
        continue;
      }
      seen.add(noteKey(note.title));
      result.consulted.push(note);
    }
  }

  return result;
}

function readFinding(
  item: unknown,
  context: AnalyzeParseContext,
  dropped: Record<AnalyzeDropReason, number>,
): AnalyzeFinding | null {
  if (!item || typeof item !== "object") {
    dropped.unreadable += 1;
    return null;
  }
  const row = item as Record<string, unknown>;

  let questionId: string | null = null;
  if (row.question_number !== null && row.question_number !== undefined) {
    const number = row.question_number;
    questionId =
      typeof number === "number" && Number.isInteger(number)
        ? (context.questionIds[number - 1] ?? null)
        : null;
    if (!questionId) {
      dropped.unknown_question += 1;
      return null;
    }
  }

  const kind = row.kind;
  if (typeof kind !== "string" || !(DATA_POINT_KINDS as readonly string[]).includes(kind)) {
    dropped.unreadable += 1;
    return null;
  }

  const claim = typeof row.claim === "string" ? collapseWhitespace(row.claim) : "";
  if (claim === "") {
    dropped.empty_claim += 1;
    return null;
  }
  if (claim.length > CLAIM_MAX) {
    dropped.claim_too_long += 1;
    return null;
  }

  const significance =
    typeof row.significance === "string" ? collapseWhitespace(row.significance) : "";
  if (significance === "") {
    dropped.no_significance += 1;
    return null;
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
    return null;
  }

  const merged = mergeRanges(ranges);
  const unitIds = unitIdsOf(merged);
  if (isInterviewerOnly(unitIds, context)) {
    dropped.interviewer += 1;
    return null;
  }

  return {
    questionId,
    relevance: questionId ? "question" : "general",
    questionKey: questionId,
    kind: kind as DataPointKind,
    claim,
    significance: truncateWords(significance, SIGNIFICANCE_MAX),
    ranges: merged,
    unitIds,
  };
}

function readExcerpt(
  item: unknown,
  context: AnalyzeParseContext,
  findings: ReadonlyMap<number, AnalyzeFinding>,
  dropped: Record<AnalyzeDropReason, number>,
): AnalyzeExcerpt | null {
  if (!item || typeof item !== "object") {
    dropped.unreadable += 1;
    return null;
  }
  const row = item as Record<string, unknown>;
  const first = row.first_unit;
  const last = row.last_unit;
  if (!Number.isInteger(first) || !Number.isInteger(last) || (first as number) > (last as number)) {
    dropped.clip_unknown_unit += 1;
    return null;
  }
  const low = first as number;
  const high = last as number;

  const covered: ExtractionUnit[] = [];
  for (let id = low; id <= high; id++) {
    const unit = context.unitsById.get(id);
    // Every sentence from first to last has to be one this window showed: a clip across a gap
    // would cut two passages together.
    if (!unit || !context.validUnitIds.has(id)) {
      dropped.clip_unknown_unit += 1;
      return null;
    }
    covered.push(unit);
  }

  const speakers = new Set(covered.map((unit) => context.speakerByUnit.get(unit.id) ?? null));
  if (speakers.size > 1) {
    dropped.clip_mixed_speakers += 1;
    return null;
  }
  if (
    isInterviewerOnly(
      covered.map((unit) => unit.id),
      context,
    )
  ) {
    dropped.interviewer += 1;
    return null;
  }

  const startMs = covered[0]!.startMs;
  const endMs = covered[covered.length - 1]!.endMs;
  if (startMs === undefined || endMs === undefined) {
    dropped.clip_no_time += 1;
    return null;
  }
  const length = endMs - startMs;
  if (length < MIN_QUOTE_MS || length > MAX_QUOTE_MS) {
    dropped.clip_wrong_length += 1;
    return null;
  }

  const why = typeof row.why === "string" ? collapseWhitespace(row.why) : "";
  if (why === "") {
    dropped.clip_no_reason += 1;
    return null;
  }

  const number = row.finding_number;
  const serves =
    typeof number === "number" && Number.isInteger(number) ? (findings.get(number) ?? null) : null;

  return {
    firstUnit: low,
    lastUnit: high,
    startMs,
    endMs,
    why: truncateWords(why, EXCERPT_WHY_MAX),
    speakerId: [...speakers][0] ?? null,
    serves,
  };
}

function readConsulted(
  item: unknown,
  context: AnalyzeParseContext,
  findings: ReadonlyMap<number, AnalyzeFinding>,
): AnalyzeConsulted | null {
  const row = (item ?? {}) as Record<string, unknown>;
  const title = typeof row.title === "string" ? collapseWhitespace(row.title) : "";
  const summary = typeof row.summary === "string" ? collapseWhitespace(row.summary) : "";
  const url = typeof row.url === "string" ? row.url.trim() : "";
  const usable =
    title !== "" &&
    title.length <= NOTE_TITLE_MAX &&
    summary !== "" &&
    summary.length <= NOTE_SUMMARY_MAX &&
    /^https?:\/\//i.test(url) &&
    hostLabel(url) !== "" &&
    (context.seenUrls === null || context.seenUrls.size === 0 || context.seenUrls.has(url));
  if (!usable) return null;

  const informs: AnalyzeFinding[] = [];
  for (const number of Array.isArray(row.finding_numbers) ? row.finding_numbers : []) {
    const finding = typeof number === "number" ? findings.get(number) : undefined;
    if (finding && !informs.includes(finding)) informs.push(finding);
  }
  return { title, summary, url, sourceName: hostLabel(url), informs };
}

// Windows -------------------------------------------------------------------------------------

/**
 * Merges the answers for a source's windows. Windows overlap, so the same finding or clip can
 * come back twice: the earlier window's wins (it saw the passage from its start), and whatever
 * pointed at the dropped copy is re-pointed at the one that stayed. The clip ceiling applies to
 * the whole source.
 */
export function mergeAnalyses(parts: readonly ParsedAnalysis[]): ParsedAnalysis & {
  duplicateFindings: number;
} {
  let dropped = emptyAnalyzeDropped();
  for (const part of parts) dropped = sumAnalyzeDropped(dropped, part.dropped);

  const all = parts.flatMap((part) => part.findings);
  const { kept: findings } = dropOverlapping(all);
  const canonical = new Map<AnalyzeFinding, AnalyzeFinding>();
  for (const finding of all) {
    const same = findings.find(
      (kept) =>
        kept === finding ||
        (kept.relevance === finding.relevance &&
          kept.questionKey === finding.questionKey &&
          sharedShare(kept.unitIds, finding.unitIds) >= 0.5),
    );
    if (same) canonical.set(finding, same);
  }
  const resolve = (finding: AnalyzeFinding | null): AnalyzeFinding | null =>
    finding ? (canonical.get(finding) ?? null) : null;

  const excerpts: AnalyzeExcerpt[] = [];
  for (const excerpt of parts.flatMap((part) => part.excerpts)) {
    if (excerpts.some((other) => sameStretch(other, excerpt))) {
      dropped.clip_duplicate += 1;
      continue;
    }
    excerpts.push({ ...excerpt, serves: resolve(excerpt.serves) });
  }
  if (excerpts.length > MAX_ANALYZE_EXCERPTS) {
    dropped.clip_over_limit += excerpts.length - MAX_ANALYZE_EXCERPTS;
  }

  const consulted: AnalyzeConsulted[] = [];
  for (const note of parts.flatMap((part) => part.consulted)) {
    const informs = note.informs
      .map((finding) => resolve(finding))
      .filter((finding): finding is AnalyzeFinding => finding !== null);
    const existing = consulted.find((other) => other.url === note.url);
    if (existing) {
      for (const finding of informs)
        if (!existing.informs.includes(finding)) existing.informs.push(finding);
    } else {
      consulted.push({ ...note, informs: [...new Set(informs)] });
    }
  }

  return {
    findings,
    excerpts: excerpts.slice(0, MAX_ANALYZE_EXCERPTS),
    consulted,
    dropped,
    duplicateFindings: all.length - findings.length,
  };
}

function sharedShare(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return shared / Math.min(a.size, b.size);
}
