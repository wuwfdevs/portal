import { Steps } from "@/components/ui/steps";
import { SectionHeading } from "@/components/ui/section-heading";
import { TextLink } from "@/components/ui/primary-link";
import type { ProjectSourceSummary } from "@/lib/transcription/projects";
import { projectPath } from "@/lib/transcription/links";
import {
  getSourceResearch,
  listContextNotes,
  listProjectRuns,
  listResearchQuestions,
} from "@/lib/sourcework/research-queries";
import { projectStanding } from "@/lib/sourcework/run-state";
import { contextNeedsRefresh } from "@/lib/sourcework/context-prompt";
import { currentStepIndex } from "@/lib/sourcework/setup-view";
import { SetupResearch } from "./setup-research";

/**
 * The Setup tab: where the project stands, its research questions, and the web
 * background gathered for them (docs/sourcework-analysis-design.md §7.1). The
 * standing reports; it never gates, so every part works at any time.
 */
export async function SetupTab({
  projectId,
  sources,
}: {
  projectId: string;
  sources: ProjectSourceSummary[];
}) {
  const [questions, notes, runs, research] = await Promise.all([
    listResearchQuestions(projectId),
    listContextNotes(projectId),
    listProjectRuns(projectId),
    getSourceResearch(
      projectId,
      sources.map((entry) => ({
        sourceId: entry.sourceId,
        status: entry.status,
        kind: entry.source.kind,
      })),
    ),
  ]);

  const activeQuestions = questions.filter((question) => question.archivedAt === null);
  const lastContextRun = runs.find((run) => run.kind === "context") ?? null;
  const fingerprint = lastContextRun?.counts.questions_fingerprint;
  const backgroundStale = contextNeedsRefresh({
    questions: activeQuestions.map((question) => question.question),
    lastRun: lastContextRun
      ? {
          status: lastContextRun.status,
          fingerprint: typeof fingerprint === "string" ? fingerprint : null,
        }
      : null,
  });

  const standing = projectStanding({
    questionCount: activeQuestions.length,
    sources: sources.map((entry) => ({
      title: entry.source.title,
      state: research.get(entry.sourceId)?.state ?? { kind: "idle" },
    })),
    toReviewTotal: [...research.values()].reduce((sum, item) => sum + item.counts.toReview, 0),
  });
  const current = currentStepIndex(standing.steps);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section aria-labelledby="standing-heading">
        <SectionHeading level="eyebrow" id="standing-heading" className="mb-2">
          Where this project stands
        </SectionHeading>
        <div className="flex flex-col gap-3 rounded border border-line bg-white p-4 sm:p-5">
          <Steps
            label="Where this project stands"
            current={current}
            className="hidden sm:flex"
            steps={standing.steps.map((step) => ({ label: step.label }))}
          />
          <Steps
            label="Where this project stands"
            current={current}
            className="sm:hidden"
            steps={standing.steps.map((step) => ({ label: step.shortLabel }))}
          />
          <p className="text-sm text-ink-700">
            {standing.message}
            {standing.link && (
              <>
                {" "}
                <TextLink
                  href={
                    standing.link.to === "sources"
                      ? projectPath(projectId)
                      : projectPath(projectId, "setup")
                  }
                  className="inline-flex max-lg:min-h-11 max-lg:items-center"
                >
                  {standing.link.label}
                </TextLink>
              </>
            )}
          </p>
          <p className="text-xs text-ink-400">
            <span className="hidden sm:inline">
              This is a status, not a sequence. New sources can arrive at any time and send the
              project back to step 3.
            </span>
            <span className="sm:hidden">
              A status, not a sequence. New sources send the project back to step 3.
            </span>
          </p>
        </div>
      </section>

      <SetupResearch
        projectId={projectId}
        questions={questions}
        notes={notes}
        backgroundStale={backgroundStale}
      />
    </div>
  );
}
