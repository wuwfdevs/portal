import type { ReactNode } from "react";
import { PrimaryLink } from "@/components/ui/primary-link";
import { Steps } from "@/components/ui/steps";
import {
  PROJECT_STEPS,
  nextStepEyebrow,
  nextStepHeadline,
  type NextStep,
  type ProjectStage,
} from "@/lib/sourcework/project-stage";
import { projectPath } from "@/lib/transcription/links";
import { AddSourceButton } from "./add-source-button";
import { AnalyzeButton } from "./extraction-controls";

/**
 * Where the project stands, in one line, and the one thing to do about it. The strip is the
 * existing Steps indicator (a done step links to its tab); the band under it holds a single
 * primary action and, while the next step is one a model could take, the sparkle-marked link that
 * hands the remaining steps over. It reports and suggests; every step stays reachable by hand from
 * its own tab (docs/sourcework-analysis-design.md, "Setup" standing).
 */
export function ProjectOverview({
  projectId,
  stage,
  handover,
}: {
  projectId: string;
  stage: ProjectStage;
  /** The client link that opens the hand-over dialog; omitted when nothing is left to hand over. */
  handover: ReactNode;
}) {
  return (
    <section aria-label="Where this project stands" className="mb-6 flex flex-col gap-4">
      <Steps
        label="Project steps"
        current={stage.current}
        steps={PROJECT_STEPS.map((step) => ({
          label: step.label,
          href: projectPath(projectId, step.view ?? undefined),
        }))}
      />
      <NextStepBand projectId={projectId} next={stage.next} handover={handover} />
    </section>
  );
}

function NextStepBand({
  projectId,
  next,
  handover,
}: {
  projectId: string;
  next: NextStep;
  handover: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded border border-line bg-panel-50 px-4 py-4 sm:px-5">
      <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-400">
          {nextStepEyebrow(next)}
        </span>
        <p className="text-base font-semibold leading-snug text-ink-900">
          {nextStepHeadline(next)}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
        <NextStepAction projectId={projectId} next={next} />
        {handover}
      </div>
    </div>
  );
}

function NextStepAction({ projectId, next }: { projectId: string; next: NextStep }) {
  switch (next.kind) {
    case "add_sources":
      return <AddSourceButton projectId={projectId} hasSources={false} primary />;
    case "wait_for_sources":
      return null;
    case "analyze":
      return <AnalyzeButton emphasis />;
    case "review":
      return (
        <PrimaryLink href={projectPath(projectId, "review")}>Review {next.waiting}</PrimaryLink>
      );
    case "accept_first":
      return <PrimaryLink href={projectPath(projectId, "review")}>Open Review</PrimaryLink>;
    case "synthesize":
      return <PrimaryLink href={projectPath(projectId, "synthesis")}>Open Synthesis</PrimaryLink>;
    case "start_piece":
      return <PrimaryLink href={projectPath(projectId, "pieces")}>Start a piece</PrimaryLink>;
    case "continue_piece":
      return <PrimaryLink href={projectPath(projectId, "pieces")}>Open pieces</PrimaryLink>;
  }
}

/** Whether the hand-over link belongs in the band: the remaining steps are ones a model can take. */
export function offersHandover(next: NextStep): boolean {
  return (
    next.kind === "analyze" ||
    next.kind === "review" ||
    next.kind === "accept_first" ||
    next.kind === "synthesize"
  );
}
