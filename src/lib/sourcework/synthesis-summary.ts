// Numbers and comparisons read off a synthesis body for the Synthesis tab: the summary strip, the
// section list, and what changed since the previous version. Pure: no Supabase, no JSX.

import { pluralize } from "@/lib/format";
import {
  CERTAINTIES,
  overlap,
  type Certainty,
  type SynthesisBody,
  type SynthesisFinding,
} from "./synthesis";

export interface SynthesisSummary {
  statements: number;
  byCertainty: Record<Certainty, number>;
  tensions: number;
  gaps: number;
  /** Patterns a person has not dismissed. */
  patterns: number;
  narrative: number;
  /** Statements, tensions and patterns left with no accepted finding behind them. */
  unsupported: number;
}

export function summarizeSynthesis(
  body: SynthesisBody,
  unsupported: ReadonlySet<string>,
): SynthesisSummary {
  const byCertainty = Object.fromEntries(CERTAINTIES.map((key) => [key, 0])) as Record<
    Certainty,
    number
  >;
  let statements = 0;
  let gaps = 0;
  for (const section of body.sections) {
    for (const finding of section.findings) {
      statements += 1;
      byCertainty[finding.certainty] += 1;
    }
    gaps += section.gaps.length;
  }
  return {
    statements,
    byCertainty,
    tensions: body.tensions.length,
    gaps,
    patterns: body.emerging.filter((theme) => theme.status !== "dismissed").length,
    narrative: body.narrative.length,
    unsupported: unsupported.size,
  };
}

/** The anchor ids the section list links to. Stable, so a link survives a refresh. */
export const SECTION_ANCHORS = {
  patterns: "patterns",
  tensions: "tensions",
  narrative: "worth-hearing",
} as const;

export function questionAnchor(questionId: string | null): string {
  return questionId ? `question-${questionId}` : "no-question";
}

export interface SynthesisDiff {
  added: number;
  removed: number;
  /** Same statement (by what it cites), now at a different certainty. */
  recertified: number;
}

/**
 * What changed between two versions' statements. A model run rewrites every statement under a new id,
 * so a statement is the same when most of what it cites is the same, not when its words or id match.
 */
export function diffSynthesis(previous: SynthesisBody, current: SynthesisBody): SynthesisDiff {
  const all = (body: SynthesisBody): SynthesisFinding[] =>
    body.sections.flatMap((section) => section.findings);
  const before = all(previous);
  const after = all(current);
  const match = (statement: SynthesisFinding, pool: readonly SynthesisFinding[]) =>
    pool.find((other) => overlap(statement.cites, other.cites) >= 0.5);

  let added = 0;
  let recertified = 0;
  for (const statement of after) {
    const old = match(statement, before);
    if (!old) added += 1;
    else if (old.certainty !== statement.certainty) recertified += 1;
  }
  const removed = before.filter((statement) => !match(statement, after)).length;
  return { added, removed, recertified };
}

/** "Since version 3: 2 new statements, 1 removed, 1 changed certainty", or null when nothing moved. */
export function diffLine(diff: SynthesisDiff, previousVersion: number): string | null {
  const parts: string[] = [];
  if (diff.added > 0) parts.push(pluralize(diff.added, "new statement"));
  if (diff.removed > 0) parts.push(`${diff.removed} removed`);
  if (diff.recertified > 0) parts.push(`${diff.recertified} changed certainty`);
  return parts.length === 0 ? null : `Since version ${previousVersion}: ${parts.join(", ")}`;
}

/**
 * The model-written version that came before the one being read, to compare against. A person's own
 * edit (dismissing a pattern) is a version too but says nothing about what a run changed, so it is
 * skipped: the baseline is the run before the latest run at or below `shown`.
 */
export function previousRunVersion(
  versions: readonly { version: number; savedVia: "person" | "model" }[],
  shown: number,
): number | null {
  const runs = versions
    .filter((entry) => entry.savedVia === "model" && entry.version <= shown)
    .map((entry) => entry.version)
    .sort((a, b) => b - a);
  return runs[1] ?? null;
}
