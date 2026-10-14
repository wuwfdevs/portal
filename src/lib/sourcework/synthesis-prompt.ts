// Synthesis (docs/sourcework-analysis-design.md §21): what the model is given, what it may return,
// and the checks on what comes back. Pure.
//
// The model reads every accepted finding in a project, numbered, and writes what they establish about
// each research question. It cites findings by number and passages it found with its tools by ref;
// code maps both to ids and times. Structure is enforced here, not asked for: a statement with no valid
// citation is dropped, a "tension" needs two sides resting on different findings, and the ceilings on
// how much is kept are in code. What good wording looks like is separate language editors own (the
// `synthesis` slot in prompts.ts), appended to this framing.

import { collapseWhitespace } from "@/lib/text";
import {
  CERTAINTIES,
  GAP_MAX,
  MAX_FINDINGS_PER_SECTION,
  MAX_GAPS_PER_SECTION,
  MAX_EMERGING,
  MAX_NARRATIVE,
  MAX_TENSIONS,
  NOTE_MAX,
  SIDE_LABEL_MAX,
  STATEMENT_MAX,
  THEME_LABEL_MAX,
  type Certainty,
  type EmergingTheme,
  type NarrativeNote,
  type PassageRef,
  type SynthesisBody,
  type SynthesisFinding,
  type SynthesisGap,
  type SynthesisSection,
  type SynthesisTension,
  type TensionSide,
  CERTAINTY_LABEL,
} from "./synthesis";

export const SYNTHESIS_FRAMING = `You are a research collaborator for a public radio newsroom. A reporter has accepted a set of findings from their sources. Say what those findings, taken together, establish about each of the project's research questions. This is an answer, not a summary: for each question, what can be said and how firmly, where the evidence conflicts, and what the sources leave open.

Each finding is numbered and paraphrases one passage in one source. Cite findings only by number. Every statement must rest on the findings you cite: add nothing from elsewhere, and state nothing more firmly than they allow. Mark each statement established (the findings agree and are firsthand or on the record), contested (credible findings conflict, or only an interested party says it) or uncertain (thin, secondhand or unconfirmed). Several findings repeating one claim from one source are one source's claim.

Tension is the most useful thing to find: sources that disagree, an official account that does not match a firsthand one, a qualification that changes what a claim means, a figure that changed over time. Report a tension only when the findings really show it; never manufacture disagreement. Give each side of a tension its position and the findings behind it.

emerging is for patterns nobody asked about. A seasoned reporter going through their material notices when different people, separately, describe the same thing: for instance, neighbors organizing to help one another instead of waiting for official help. Offer a theme only when at least two different sources independently show it, give it a short label and a sentence on what they share, and cite the findings (including ones that answer no question). Do not restate an answer to a research question, and do not offer a theme because one source dwelt on it. A few well-grounded themes are useful; a long list is noise, and none is a fine answer.

gaps are what the findings leave unanswered for a question that a reporter could go and get before relying on it.

You can check a finding against the recording. search_transcripts finds where something is said; read_around reads the lines around a finding or a passage you found. Use them when a finding looks too thin to rely on or two seem to conflict. Most runs need few or none.

narrative holds moments in the recordings that a finding wouldn't: a telling detail, a scene, a turn of phrase that might give a story life. Cite only passages you found with the tools, by their ref, and say in a sentence what each holds. Few, and none is fine.

When a current synthesis is given, revise it: keep what the findings still support, change what new findings change, and say so rather than silently contradicting it. Statements marked pinned were written or edited by a person: they are kept exactly as they are and added to your answer for you, so do not restate them.

The newsroom's editors give their guidance below.`;

export interface SynthesisQuestion {
  /** 1-based, the number the model uses. */
  number: number;
  id: string;
  question: string;
}

export interface SynthesisSource {
  /** 1-based, the number the model uses. */
  number: number;
  id: string;
  title: string;
}

export interface SynthesisInputFinding {
  /** 1-based, the number the model cites. */
  number: number;
  id: string;
  sourceNumber: number;
  /** The question's number, or null for a finding that answers none. */
  questionNumber: number | null;
  kind: string;
  claim: string;
  significance: string | null;
  speaker: string | null;
  /** "12:41" into the recording, or null for a document. */
  at: string | null;
}

export interface SynthesisInputArgs {
  projectTitle: string;
  projectDescription: string | null;
  questions: readonly SynthesisQuestion[];
  sources: readonly SynthesisSource[];
  findings: readonly SynthesisInputFinding[];
  /** The current synthesis rendered for the model (see renderBaseSynthesis), or null when there is none. */
  base: string | null;
}

/** The user message for a project's synthesis. */
export function buildSynthesisInput(args: SynthesisInputArgs): string {
  const parts: string[] = [`Project: ${args.projectTitle}`];
  if (args.projectDescription?.trim()) parts.push(collapseWhitespace(args.projectDescription));

  parts.push(
    args.questions.length > 0
      ? "Research questions:\n" +
          args.questions.map((question) => `${question.number}. ${question.question}`).join("\n")
      : "This project has no research question. Write one section with question_number null.",
  );
  parts.push(
    "Sources:\n" + args.sources.map((source) => `${source.number}. ${source.title}`).join("\n"),
  );
  parts.push(
    "Accepted findings (cite by number):\n" +
      args.findings
        .map((finding) => {
          const tags = [
            finding.questionNumber ? `Q${finding.questionNumber}` : "no question",
            finding.kind,
            `Source ${finding.sourceNumber}`,
            finding.speaker,
            finding.at ? `@${finding.at}` : null,
          ].filter(Boolean);
          return `[${finding.number}] ${tags.join(" · ")}: ${finding.claim}${
            finding.significance ? ` (Why it matters: ${finding.significance})` : ""
          }`;
        })
        .join("\n"),
  );
  if (args.base) parts.push(args.base);
  return parts.join("\n\n");
}

/**
 * The current synthesis as the model should see it: the model's own earlier statements to revise, and
 * a person's pinned ones labelled as kept. Citations are shown as this run's finding numbers; a
 * citation to a finding no longer accepted is left out.
 */
export function renderBaseSynthesis(
  base: SynthesisBody,
  context: SynthesisRenderContext & { version: number },
): string | null {
  const lines = renderSynthesisLines(base, context);
  if (lines.length === 0) return null;
  return `Current synthesis (version ${context.version}), to revise rather than start over:\n${lines.join("\n")}`;
}

export interface SynthesisRenderContext {
  questionNumberById: ReadonlyMap<string, number>;
  findingNumberById: ReadonlyMap<string, number>;
}

/** The synthesis, one line per statement, citing this run's finding numbers. Empty when there is nothing to show. */
export function renderSynthesisLines(
  base: SynthesisBody,
  context: SynthesisRenderContext,
): string[] {
  const cites = (ids: readonly string[]): string => {
    const numbers = ids
      .map((id) => context.findingNumberById.get(id))
      .filter((n): n is number => n !== undefined);
    return numbers.length > 0 ? ` [${numbers.join(", ")}]` : "";
  };

  const lines: string[] = [];
  for (const section of base.sections) {
    const number = section.questionId ? context.questionNumberById.get(section.questionId) : null;
    const items = [
      ...section.findings.map(
        (finding) =>
          `- ${finding.origin === "person" ? "(pinned) " : ""}${CERTAINTY_LABEL[finding.certainty]}: ${finding.statement}${cites(finding.cites)}`,
      ),
      ...section.gaps.map(
        (gap) => `- ${gap.origin === "person" ? "(pinned) " : ""}Gap: ${gap.text}`,
      ),
    ];
    if (items.length === 0) continue;
    lines.push(number ? `Question ${number}:` : "No question:", ...items);
  }
  for (const tension of base.tensions) {
    lines.push(
      `Tension${tension.origin === "person" ? " (pinned)" : ""}: ${tension.statement}`,
      ...tension.sides.map((side) => `- ${side.label}${cites(side.cites)}`),
    );
  }
  for (const theme of base.emerging) {
    lines.push(
      `Emerging theme${theme.origin === "person" ? " (pinned)" : ""}: ${theme.label}: ${theme.statement}${cites(theme.cites)}`,
    );
  }
  return lines;
}

export function buildSynthesisOutputSchema(): Record<string, unknown> {
  const cites = { type: "array", items: { type: "integer" } };
  return {
    type: "object",
    additionalProperties: false,
    required: ["sections", "tensions", "narrative", "emerging"],
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["question_number", "findings", "gaps"],
          properties: {
            question_number: { type: ["integer", "null"] },
            findings: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["statement", "certainty", "cites"],
                properties: {
                  statement: { type: "string" },
                  certainty: { type: "string", enum: [...CERTAINTIES] },
                  cites,
                },
              },
            },
            gaps: { type: "array", items: { type: "string" } },
          },
        },
      },
      tensions: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["statement", "sides"],
          properties: {
            statement: { type: "string" },
            sides: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["label", "cites"],
                properties: { label: { type: "string" }, cites },
              },
            },
          },
        },
      },
      emerging: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["label", "statement", "cites"],
          properties: { label: { type: "string" }, statement: { type: "string" }, cites },
        },
      },
      narrative: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["note", "passage_refs"],
          properties: {
            note: { type: "string" },
            passage_refs: { type: "array", items: { type: "integer" } },
          },
        },
      },
    },
  };
}

// Parsing -------------------------------------------------------------------------------------

export type SynthesisDropReason =
  | "unreadable"
  | "unknown_question"
  | "empty_statement"
  | "statement_too_long"
  | "bad_certainty"
  | "no_valid_cite"
  | "tension_one_sided"
  | "theme_one_source"
  | "note_no_passage"
  | "over_limit";

export function emptySynthesisDropped(): Record<SynthesisDropReason, number> {
  return {
    unreadable: 0,
    unknown_question: 0,
    empty_statement: 0,
    statement_too_long: 0,
    bad_certainty: 0,
    no_valid_cite: 0,
    tension_one_sided: 0,
    theme_one_source: 0,
    note_no_passage: 0,
    over_limit: 0,
  };
}

export interface SynthesisParseContext {
  /** Accepted finding ids in the order they were numbered (number n is index n - 1). */
  findingIds: readonly string[];
  /** Active question ids in the order they were numbered. */
  questionIds: readonly string[];
  /**
   * The source of each finding, aligned with findingIds. A theme must rest on findings from two
   * different sources; when this is absent the check is skipped (only for callers with no sources).
   */
  findingSourceIds?: readonly string[];
  /** What the tools showed the model, by the ref it was given. */
  passages: ReadonlyMap<number, PassageRef>;
  newId: () => string;
}

export interface ParsedSynthesis {
  body: SynthesisBody;
  dropped: Record<SynthesisDropReason, number>;
}

function resolveCites(value: unknown, findingIds: readonly string[]): string[] {
  const ids: string[] = [];
  for (const number of Array.isArray(value) ? value : []) {
    if (typeof number !== "number" || !Number.isInteger(number)) continue;
    const id = findingIds[number - 1];
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function words(value: unknown): string {
  return typeof value === "string" ? collapseWhitespace(value) : "";
}

/**
 * Reads the model's JSON into a synthesis body, dropping — and counting — what the code can't stand
 * behind: a statement that cites no finding the model was shown, a certainty outside the three, a
 * tension with fewer than two sides or whose sides rest on one finding, a narrative note with no
 * passage the tools returned. A number the lists don't have is dropped, never clamped.
 */
export function parseSynthesisOutput(raw: string, context: SynthesisParseContext): ParsedSynthesis {
  const dropped = emptySynthesisDropped();
  const body: SynthesisBody = { sections: [], tensions: [], narrative: [], emerging: [] };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    dropped.unreadable += 1;
    return { body, dropped };
  }
  const answer = parsed as {
    sections?: unknown;
    tensions?: unknown;
    narrative?: unknown;
    emerging?: unknown;
  } | null;
  if (!Array.isArray(answer?.sections)) {
    dropped.unreadable += 1;
    return { body, dropped };
  }

  const sections = new Map<string | null, SynthesisSection>();
  for (const raw of answer.sections) {
    const row = (raw ?? {}) as Record<string, unknown>;
    let questionId: string | null = null;
    if (row.question_number !== null && row.question_number !== undefined) {
      const number = row.question_number;
      questionId =
        typeof number === "number" && Number.isInteger(number)
          ? (context.questionIds[number - 1] ?? null)
          : null;
      if (!questionId) {
        dropped.unknown_question += 1;
        continue;
      }
    }
    const section = sections.get(questionId) ?? { questionId, findings: [], gaps: [] };

    for (const item of Array.isArray(row.findings) ? row.findings : []) {
      const finding = (item ?? {}) as Record<string, unknown>;
      const statement = words(finding.statement);
      if (statement === "") {
        dropped.empty_statement += 1;
        continue;
      }
      if (statement.length > STATEMENT_MAX) {
        dropped.statement_too_long += 1;
        continue;
      }
      if (!(CERTAINTIES as readonly string[]).includes(finding.certainty as string)) {
        dropped.bad_certainty += 1;
        continue;
      }
      const cites = resolveCites(finding.cites, context.findingIds);
      if (cites.length === 0) {
        dropped.no_valid_cite += 1;
        continue;
      }
      if (section.findings.length >= MAX_FINDINGS_PER_SECTION) {
        dropped.over_limit += 1;
        continue;
      }
      const kept: SynthesisFinding = {
        id: context.newId(),
        statement,
        certainty: finding.certainty as Certainty,
        cites,
        origin: "model",
      };
      section.findings.push(kept);
    }

    for (const item of Array.isArray(row.gaps) ? row.gaps : []) {
      const text = words(item);
      if (text === "" || text.length > GAP_MAX) {
        dropped.empty_statement += 1;
        continue;
      }
      if (section.gaps.length >= MAX_GAPS_PER_SECTION) {
        dropped.over_limit += 1;
        continue;
      }
      const gap: SynthesisGap = { id: context.newId(), text, origin: "model" };
      section.gaps.push(gap);
    }
    sections.set(questionId, section);
  }
  body.sections = [...sections.values()].filter(
    (section) => section.findings.length > 0 || section.gaps.length > 0,
  );

  for (const raw of Array.isArray(answer.tensions) ? answer.tensions : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const statement = words(row.statement);
    if (statement === "" || statement.length > STATEMENT_MAX) {
      dropped.empty_statement += 1;
      continue;
    }
    const sides: TensionSide[] = [];
    for (const side of Array.isArray(row.sides) ? row.sides : []) {
      const item = (side ?? {}) as Record<string, unknown>;
      const label = words(item.label);
      const cites = resolveCites(item.cites, context.findingIds);
      if (label !== "" && label.length <= SIDE_LABEL_MAX && cites.length > 0) {
        sides.push({ label, cites });
      }
    }
    const distinct = new Set(sides.flatMap((side) => side.cites));
    if (sides.length < 2 || distinct.size < 2) {
      dropped.tension_one_sided += 1;
      continue;
    }
    if (body.tensions.length >= MAX_TENSIONS) {
      dropped.over_limit += 1;
      continue;
    }
    const tension: SynthesisTension = { id: context.newId(), statement, sides, origin: "model" };
    body.tensions.push(tension);
  }

  for (const raw of Array.isArray(answer.emerging) ? answer.emerging : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const label = words(row.label);
    const statement = words(row.statement);
    if (label === "" || label.length > THEME_LABEL_MAX || statement === "") {
      dropped.empty_statement += 1;
      continue;
    }
    if (statement.length > STATEMENT_MAX) {
      dropped.statement_too_long += 1;
      continue;
    }
    const cites = resolveCites(row.cites, context.findingIds);
    if (cites.length === 0) {
      dropped.no_valid_cite += 1;
      continue;
    }
    if (context.findingSourceIds) {
      const sourceIds = new Set(
        cites.map((id) => context.findingSourceIds![context.findingIds.indexOf(id)]),
      );
      if (sourceIds.size < 2) {
        dropped.theme_one_source += 1;
        continue;
      }
    }
    if (body.emerging.length >= MAX_EMERGING) {
      dropped.over_limit += 1;
      continue;
    }
    const theme: EmergingTheme = { id: context.newId(), label, statement, cites, origin: "model" };
    body.emerging.push(theme);
  }

  for (const raw of Array.isArray(answer.narrative) ? answer.narrative : []) {
    const row = (raw ?? {}) as Record<string, unknown>;
    const note = words(row.note);
    if (note === "" || note.length > NOTE_MAX) {
      dropped.empty_statement += 1;
      continue;
    }
    const passages: PassageRef[] = [];
    for (const ref of Array.isArray(row.passage_refs) ? row.passage_refs : []) {
      const found = typeof ref === "number" ? context.passages.get(ref) : undefined;
      if (found && !passages.includes(found)) passages.push(found);
    }
    if (passages.length === 0) {
      dropped.note_no_passage += 1;
      continue;
    }
    if (body.narrative.length >= MAX_NARRATIVE) {
      dropped.over_limit += 1;
      continue;
    }
    const kept: NarrativeNote = { id: context.newId(), note, passages, origin: "model" };
    body.narrative.push(kept);
  }

  return { body, dropped };
}
