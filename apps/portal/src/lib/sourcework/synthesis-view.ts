// Small pure rules behind the Synthesis tab (docs/sourcework-analysis-design.md §21): how a statement's
// support is worded, which badge a certainty gets, what a finished run says. No Supabase, no JSX.

import { pluralize } from "@/lib/format";
import type { BadgeVariant } from "@/components/ui/badge";
import type { Certainty } from "./synthesis";

export const CERTAINTY_VARIANT: Record<Certainty, BadgeVariant> = {
  established: "success",
  contested: "warning",
  uncertain: "muted",
};

/** "3 findings · 2 sources · 2 speakers", or one source's claim said as such. */
export function breadthLine(breadth: {
  findings: number;
  sources: number;
  speakers: number;
}): string {
  if (breadth.findings === 0) return "No accepted finding supports this any more";
  const parts = [pluralize(breadth.findings, "finding"), pluralize(breadth.sources, "source")];
  if (breadth.speakers > 0) parts.push(pluralize(breadth.speakers, "speaker"));
  const line = parts.join(" · ");
  return breadth.sources === 1 ? `${line} (one source's account)` : line;
}

/** What a finished run says. `dropped` counts proposals the code's checks refused. */
export function synthesisSummary(outcome: {
  version: number;
  statements: number;
  tensions: number;
  gaps: number;
  narrative: number;
  emerging?: number;
  dropped: number;
}): string {
  const parts = [pluralize(outcome.statements, "statement")];
  if (outcome.tensions > 0) parts.push(pluralize(outcome.tensions, "tension"));
  if (outcome.gaps > 0) parts.push(pluralize(outcome.gaps, "gap"));
  if (outcome.emerging && outcome.emerging > 0)
    parts.push(pluralize(outcome.emerging, "emerging theme"));
  if (outcome.narrative > 0) parts.push(pluralize(outcome.narrative, "narrative note"));
  const dropped =
    outcome.dropped > 0
      ? ` ${pluralize(outcome.dropped, "proposal")} failed the checks and were left out.`
      : "";
  return `Version ${outcome.version} written: ${parts.join(", ")}.${dropped}`;
}

export function synthesizeButtonLabel(hasSynthesis: boolean, changedSince: number): string {
  if (!hasSynthesis) return "Synthesize";
  return changedSince > 0 ? "Update synthesis" : "Synthesize again";
}

/** The sentence under the heading, depending on what exists. */
export function synthesisIntro(args: {
  acceptedFindings: number;
  questionCount: number;
  hasSynthesis: boolean;
}): string {
  if (args.acceptedFindings === 0) {
    return "Synthesis reads the findings you have accepted and says what they establish. Analyze a source and accept what is worth keeping, then come back.";
  }
  if (!args.hasSynthesis) {
    return args.questionCount > 0
      ? "Synthesis reads every accepted finding and says, for each of your questions, what is established, where accounts conflict and what is still open. Nothing here is evidence: each statement links to the findings behind it."
      : "Synthesis reads every accepted finding and says what they establish, where accounts conflict and what is still open. Add research questions on the Setup tab and it will answer each one.";
  }
  return "Each statement links to the findings behind it. Synthesize again after you accept new findings: a new version is written and earlier ones stay in the history.";
}
