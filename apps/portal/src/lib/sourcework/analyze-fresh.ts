// What a re-run of Analyze may add (docs/sourcework-analysis-design.md §20). Pure.
//
// A run replaces only what is still waiting for a decision. Anything a person accepted or rejected
// stays decided: a finding on a passage they already ruled on is not made again, and neither is a
// clip over a stretch they already ruled on or already cut by hand.

import { overlapRatio, SAME_PASSAGE_OVERLAP } from "./extraction-units";
import { sameStretch, type ClipRange } from "./quotes";
import type { AnalyzeExcerpt, AnalyzeFinding } from "./analyze-prompt";

export interface DecidedFinding {
  relevance: string;
  questionKey: string | null;
  unitIds: ReadonlySet<number>;
}

/** Findings that don't sit on a passage a person already decided, with the same bearing. */
export function dropDecidedFindings<T extends AnalyzeFinding>(
  findings: readonly T[],
  decided: readonly DecidedFinding[],
): { fresh: T[]; skipped: number } {
  const fresh = findings.filter(
    (finding) =>
      !decided.some(
        (point) =>
          point.relevance === finding.relevance &&
          point.questionKey === finding.questionKey &&
          overlapRatio(point.unitIds, finding.unitIds) >= SAME_PASSAGE_OVERLAP,
      ),
  );
  return { fresh, skipped: findings.length - fresh.length };
}

/** Clips that don't land on a stretch already decided, or already made into an excerpt. */
export function dropDecidedClips<T extends Pick<AnalyzeExcerpt, "startMs" | "endMs">>(
  clips: readonly T[],
  occupied: readonly ClipRange[],
): { fresh: T[]; skipped: number } {
  const fresh = clips.filter((clip) => !occupied.some((range) => sameStretch(range, clip)));
  return { fresh, skipped: clips.length - fresh.length };
}

/** "Q2" labels for the findings already established, from the numbers the model is shown. */
export function establishedLabel(
  questionId: string | null,
  numberByQuestionId: ReadonlyMap<string, number>,
): string | null {
  if (!questionId) return null;
  const number = numberByQuestionId.get(questionId);
  return number === undefined ? null : `Q${number}`;
}
