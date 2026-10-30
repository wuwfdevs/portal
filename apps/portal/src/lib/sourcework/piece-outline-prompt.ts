// What the Outline run gives the model and what it may return (docs/sourcework-analysis-design.md §22):
// the fixed framing, the reporter's accepted material, the strict output schema, and the parser that turns
// an answer into piece blocks. Pure.
//
// An outline is beats and actualities, not prose. The model cites findings by number, places actualities by
// excerpt number, and may point at a stretch of tape only by a ref one of its tools returned; code maps all
// three to ids and times, so nothing in an outline is a quotation or a time the model typed. What a good
// outline looks like is separate language editors own (the `outline` slot in prompts.ts), appended to this
// framing.

import { collapseWhitespace } from "@/lib/text";
import { formatClock } from "@/lib/format";
import {
  MAX_BEAT_CHARS,
  MAX_BEAT_CITES,
  MAX_BLOCKS,
  newActuality,
  newBeat,
  type BeatTape,
  type PieceBlock,
} from "./pieces";
import { WRITING_STANDARDS } from "./piece-standards";
import type { PassageRef } from "./synthesis";

/** Excerpts offered to one outline run. Draft offers 80; an outline is where a project's clips are weighed against each other. */
export const MAX_OUTLINE_EXCERPTS = 150;
/** Words shown per excerpt; a longer clip is cut for the model's reading only. */
export const OUTLINE_EXCERPT_CHARS = 700;

export const OUTLINE_FRAMING = `You outline a radio piece for a public radio newsroom, from material a reporter has already accepted. You are given the reporter's direction (if any), the newsroom's format (if one is chosen), the project's research questions, what the accepted findings establish (a synthesis, when one exists), the accepted findings themselves, numbered, and the excerpts available, numbered, each with its speaker, its length and its words.

An outline is an ordered list of beats and actualities. A beat is one or two sentences saying what that part of the story has to do, in the reporter's working language: it is not the narration, which is written later. The first beat is the story's angle: the point of the piece, as a sentence a listener could repeat. Order the rest as the story needs, not as the research questions or the sources happen to be arranged.

For each beat, give the numbers of the findings that carry it. Set verify when a figure, name, date or attribution rests on one source, or when findings disagree, so the reporter checks it before it is written as settled. Never cite a finding for something it does not say. Set anchor only on a first beat that is the anchor's lead-in, and only when the format calls for one.

An actuality is the speaker's own voice, placed only by its excerpt number; leave its text empty. Choose them comparatively, against every excerpt you were shown, not the first one that fits. A clip earns its place for what narration cannot do: a voice, an experience told by the person who lived it, a detail only they would know. Facts, figures and dates belong in a beat. The format's actuality count is a usual range, not a quota: fewer is normal, none is fine, and a weaker clip is never added to reach a number. Say what a clip adds in the beat that sets it up ("then Rosado on the work no number shows"), so the reporter sees why it is there. Place each excerpt at most once.

You can search the transcripts and read around a finding or a place you found. Use that when a finding looks thin, or to find tape worth the reporter's attention that is not an excerpt yet. Give such a place as tape_ref, using a ref a tool returned: you cannot name a time yourself. Most outlines need few lookups.

${WRITING_STANDARDS}

Return the blocks in order. For a beat: kind "beat", its text, finding_numbers, verify, anchor, tape_ref or null, and excerpt_number null. For an actuality: kind "actuality", empty text, no findings, verify false, anchor false, tape_ref null, and the excerpt's number. The newsroom's guidance follows.`;

export interface OutlineFindingInput {
  /** 1-based, the number the model cites. */
  number: number;
  claim: string;
  significance: string | null;
  kind: string;
  sourceTitle: string;
  speaker: string | null;
  /** "12:41" into a recording, or null. */
  at: string | null;
  questionNumber: number | null;
}

export interface OutlineExcerptInput {
  /** 1-based. */
  number: number;
  id: string;
  title: string;
  speaker: string | null;
  sourceTitle: string;
  seconds: number;
  words: string;
}

export interface OutlineInputArgs {
  projectTitle: string;
  projectDescription: string | null;
  direction: string;
  /** The rendered format guide, or null when the piece has none chosen. */
  formatGuide: string | null;
  targetSeconds: number | null;
  questions: readonly { number: number; question: string }[];
  /** The synthesis's lines (renderSynthesisLines), or empty when there is none. */
  synthesisLines: readonly string[];
  findings: readonly OutlineFindingInput[];
  excerpts: readonly OutlineExcerptInput[];
}

export function buildOutlineInput(args: OutlineInputArgs): string {
  const parts: string[] = [`Project: ${args.projectTitle}`];
  if (args.projectDescription?.trim()) parts.push(collapseWhitespace(args.projectDescription));
  parts.push(
    `Direction from the reporter:\n${args.direction.trim() ? args.direction.trim() : "None given."}`,
  );
  if (args.formatGuide) parts.push(`Format:\n${args.formatGuide}`);
  if (args.targetSeconds !== null) parts.push(`Target length: ${formatClock(args.targetSeconds)}.`);

  parts.push(
    args.questions.length > 0
      ? "Research questions:\n" + args.questions.map((q) => `${q.number}. ${q.question}`).join("\n")
      : "This project has no research question.",
  );
  if (args.synthesisLines.length > 0) {
    parts.push(
      "What the accepted findings establish (a reading aid; cite findings, not this):\n" +
        args.synthesisLines.join("\n"),
    );
  }

  parts.push(
    args.findings.length > 0
      ? "Accepted findings (cite by number):\n" +
          args.findings
            .map((finding) => {
              const tags = [
                finding.questionNumber ? `Q${finding.questionNumber}` : "no question",
                finding.kind,
                finding.sourceTitle,
                finding.speaker,
                finding.at ? `@${finding.at}` : null,
              ].filter(Boolean);
              return `[${finding.number}] ${tags.join(" · ")}: ${finding.claim}${
                finding.significance ? ` (Why it matters: ${finding.significance})` : ""
              }`;
            })
            .join("\n")
      : "Accepted findings: none. Outline from the excerpts alone.",
  );

  parts.push(
    args.excerpts.length > 0
      ? "Excerpts you may place, by number. The words are the transcript's:\n" +
          args.excerpts
            .map((excerpt) => {
              const words =
                excerpt.words.length > OUTLINE_EXCERPT_CHARS
                  ? `${excerpt.words.slice(0, OUTLINE_EXCERPT_CHARS)}…`
                  : excerpt.words;
              return [
                `Excerpt ${excerpt.number} · ${formatClock(excerpt.seconds)} · ${excerpt.speaker ?? "speaker not named"} · ${excerpt.sourceTitle}`,
                `“${words || excerpt.title}”`,
              ].join("\n");
            })
            .join("\n")
      : "Excerpts: none. This project has no excerpts yet, so outline with beats only; a beat may point at tape.",
  );
  return parts.join("\n\n");
}

export function buildOutlineOutputSchema(): Record<string, unknown> {
  return {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "kind",
            "text",
            "finding_numbers",
            "verify",
            "anchor",
            "tape_ref",
            "excerpt_number",
          ],
          properties: {
            kind: { type: "string", enum: ["beat", "actuality"] },
            text: { type: "string" },
            finding_numbers: { type: "array", items: { type: "integer" } },
            verify: { type: "boolean" },
            anchor: { type: "boolean" },
            tape_ref: { type: ["integer", "null"] },
            excerpt_number: { type: ["integer", "null"] },
          },
        },
      },
    },
  };
}

export type OutlineDropReason =
  | "unreadable"
  | "empty_beat"
  | "unknown_finding"
  | "tape_invalid"
  | "anchor_moved"
  | "unknown_excerpt"
  | "duplicate_excerpt"
  | "over_limit";

export function emptyOutlineDropped(): Record<OutlineDropReason, number> {
  return {
    unreadable: 0,
    empty_beat: 0,
    unknown_finding: 0,
    tape_invalid: 0,
    anchor_moved: 0,
    unknown_excerpt: 0,
    duplicate_excerpt: 0,
    over_limit: 0,
  };
}

export interface OutlineParseContext {
  /** Accepted finding ids in the order they were numbered (number n is index n - 1). */
  findingIds: readonly string[];
  excerpts: readonly Pick<OutlineExcerptInput, "number" | "id">[];
  /** What the tools showed the model, by the ref it was given. */
  passages: ReadonlyMap<number, PassageRef>;
  newId: () => string;
}

export type OutlineParse =
  | {
      ok: true;
      blocks: PieceBlock[];
      dropped: Record<OutlineDropReason, number>;
      warnings: string[];
    }
  | { ok: false; error: string };

const UNREADABLE = "The outline came back in a shape that couldn't be read. Try again.";

/**
 * Turns the model's answer into blocks. A finding number the model was not shown is dropped from the
 * beat's citations; a tape ref no tool returned, or one that isn't a recording range, leaves the beat
 * without tape; an excerpt it was not shown, or one already placed, is dropped; an anchor flag past the
 * first block is ignored. A beat with no words is dropped. An answer with no beat at all is a failure.
 */
export function parseOutlineOutput(text: string, context: OutlineParseContext): OutlineParse {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: UNREADABLE };
  }
  const items = (raw as { blocks?: unknown })?.blocks;
  if (!Array.isArray(items)) return { ok: false, error: UNREADABLE };

  const dropped = emptyOutlineDropped();
  const excerptIdByNumber = new Map(
    context.excerpts.map((excerpt) => [excerpt.number, excerpt.id]),
  );
  const placed = new Set<string>();
  const blocks: PieceBlock[] = [];

  for (const item of items) {
    if (blocks.length >= MAX_BLOCKS) {
      dropped.over_limit += 1;
      continue;
    }
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;

    if (row.kind === "beat") {
      const beatText =
        typeof row.text === "string" ? collapseWhitespace(row.text).slice(0, MAX_BEAT_CHARS) : "";
      if (beatText === "") {
        dropped.empty_beat += 1;
        continue;
      }
      const cites: string[] = [];
      for (const number of Array.isArray(row.finding_numbers) ? row.finding_numbers : []) {
        const id =
          typeof number === "number" && Number.isInteger(number)
            ? context.findingIds[number - 1]
            : undefined;
        if (!id) dropped.unknown_finding += 1;
        else if (!cites.includes(id) && cites.length < MAX_BEAT_CITES) cites.push(id);
      }

      let tape: BeatTape | undefined;
      if (row.tape_ref !== null && row.tape_ref !== undefined) {
        const passage =
          typeof row.tape_ref === "number" ? context.passages.get(row.tape_ref) : undefined;
        if (
          passage &&
          passage.startMs !== null &&
          passage.endMs !== null &&
          passage.endMs > passage.startMs
        ) {
          tape = { sourceId: passage.sourceId, startMs: passage.startMs, endMs: passage.endMs };
        } else {
          dropped.tape_invalid += 1;
        }
      }

      let role: "anchor" | undefined;
      if (row.anchor === true) {
        if (blocks.length === 0) role = "anchor";
        else dropped.anchor_moved += 1;
      }
      blocks.push(
        newBeat(context.newId(), beatText, {
          cites,
          verify: row.verify === true,
          role,
          tape,
        }),
      );
    } else if (row.kind === "actuality") {
      const number = row.excerpt_number;
      const excerptId = typeof number === "number" ? excerptIdByNumber.get(number) : undefined;
      if (!excerptId) {
        dropped.unknown_excerpt += 1;
        continue;
      }
      if (placed.has(excerptId)) {
        dropped.duplicate_excerpt += 1;
        continue;
      }
      placed.add(excerptId);
      blocks.push(newActuality(context.newId(), excerptId));
    }
  }

  if (!blocks.some((block) => block.type === "beat")) {
    return { ok: false, error: "The outline came back with no beats. Try again." };
  }

  const warnings: string[] = [];
  if (dropped.unknown_excerpt > 0)
    warnings.push(
      `${dropped.unknown_excerpt} excerpt(s) the model named were not in the list and were left out.`,
    );
  if (dropped.duplicate_excerpt > 0)
    warnings.push(
      `${dropped.duplicate_excerpt} excerpt(s) placed twice were left out the second time.`,
    );
  if (dropped.unknown_finding > 0)
    warnings.push(
      `${dropped.unknown_finding} finding number(s) the model cited did not exist and were removed.`,
    );
  if (dropped.tape_invalid > 0)
    warnings.push(
      `${dropped.tape_invalid} tape reference(s) could not be placed and were removed.`,
    );
  if (dropped.over_limit > 0) warnings.push(`The outline was cut at ${MAX_BLOCKS} blocks.`);
  return { ok: true, blocks, dropped, warnings };
}
