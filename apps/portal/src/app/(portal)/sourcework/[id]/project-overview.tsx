import type { ReactNode } from "react";
import { PrimaryLink } from "@/components/ui/primary-link";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Steps } from "@/components/ui/steps";
import {
  PROJECT_STEPS,
  hasNextStep,
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
 * its own tab (docs/sourcework-analysis-design.md, "Setup" standing). It shows only while
 * there is a next step (a project that has reached its pieces shows nothing: the Pieces tab says it).
 * On a phone the strip is left out, since the tabs and the Review badge carry it, and the band loses
 * its box and eyebrow so it reads as one line: what is next, and the one thing to do.
 */
export function ProjectOverview({
  projectId,
  stage,
  reviewProgress,
  handover,
}: {
  projectId: string;
  stage: ProjectStage;
  /** Findings decided of all findings, shown on the Review step; null when there are none. */
  reviewProgress: { done: number; total: number } | null;
  /** The client link that opens the hand-over dialog; omitted when nothing is left to hand over. */
  handover: ReactNode;
}) {
  if (!hasNextStep(stage.next)) return null;
  return (
    <section
      aria-label="Where this project stands"
      className="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4"
    >
      <Steps
        label="Project steps"
        className="max-sm:hidden"
        current={stage.current}
        steps={PROJECT_STEPS.map((step) => ({
          label: step.label,
          href: projectPath(projectId, step.view ?? undefined),
        }))}
      />
      <NextStepBand
        projectId={projectId}
        next={stage.next}
        reviewProgress={reviewProgress}
        handover={handover}
      />
    </section>
  );
}

function NextStepBand({
  projectId,
  next,
  reviewProgress,
  handover,
}: {
  projectId: string;
  next: NextStep;
  reviewProgress: { done: number; total: number } | null;
  handover: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2.5 sm:gap-y-3 sm:rounded sm:border sm:border-line sm:bg-panel-50 sm:px-5 sm:py-4">
      <div className="flex min-w-0 flex-1 basis-40 flex-col gap-1 sm:basis-80 sm:gap-1.5">
        <span className="text-label font-bold uppercase tracking-wider text-ink-400 max-sm:hidden">
          {nextStepEyebrow(next)}
        </span>
        <p className="text-base font-semibold leading-snug text-ink-900">
          {nextStepHeadline(next)}
        </p>
        {next.kind === "review" && reviewProgress && (
          <div className="flex max-w-md items-center gap-3">
            <ProgressBar
              className="flex-1"
              label="Findings decided"
              done={reviewProgress.done}
              total={reviewProgress.total}
              valueText={`${reviewProgress.done} of ${reviewProgress.total} findings decided`}
            />
            <span className="whitespace-nowrap text-xs text-ink-500">
              {reviewProgress.done} of {reviewProgress.total} findings decided
            </span>
          </div>
        )}
      </div>
      {/* On a phone the action and the hand-over link share a line; from `sm` they stack at the right. */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 sm:flex-col sm:items-end sm:gap-2.5">
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
