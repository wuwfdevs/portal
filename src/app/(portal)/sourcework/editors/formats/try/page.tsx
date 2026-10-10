import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { withQuery } from "@/lib/paths";
import { requireSourceworkEditor } from "@/lib/sourcework/access";
import {
  getFormatEditorData,
  getFormatTrial,
  listFormatTrialSamples,
  listRecentFormatTrials,
} from "@/lib/sourcework/piece-format-queries";
import { parseFormatTrialResults } from "@/lib/sourcework/piece-format-trials";
import { uuidParam } from "@/lib/sourcework/route-input";
import { TRIAL_KEEP_DAYS } from "@/lib/sourcework/trials";
import { LocalTime } from "../../local-time";
import { FormatTryActions } from "./format-try-actions";
import { FormatTryForm } from "./format-try-form";
import { FormatTrialView } from "./format-trial-view";

export const metadata = { title: "Try a format" };
// The trial runs in its own route (maxDuration 300); this page only reads.

/**
 * "Try this draft" for a piece format (docs/sourcework-analysis-design.md §6.3, §8.1): draft a
 * piece from one project's accepted themes and excerpts with the live version and the draft,
 * side by side. Nothing is saved to the project; results are the editor's own, kept 14 days.
 */
export default async function FormatTryPage({
  searchParams,
}: {
  searchParams: Promise<{ format?: string; trial?: string; project?: string }>;
}) {
  const context = await requireSourceworkEditor();
  if (!context) notFound();
  const params = await searchParams;
  const formatId = uuidParam(params.format);
  if (!formatId) notFound();
  const userId = context.profile.id;
  const trialId = uuidParam(params.trial);

  const [format, samples, recent, trial] = await Promise.all([
    getFormatEditorData(formatId, userId),
    listFormatTrialSamples(),
    listRecentFormatTrials(userId, formatId),
    trialId ? getFormatTrial(trialId, userId, formatId) : Promise.resolve(null),
  ]);
  if (!format) notFound();

  const editorHref = `/sourcework/editors/formats?format=${formatId}`;
  const requested = uuidParam(params.project) ?? recent[0]?.projectId ?? null;
  const initialProject =
    samples.find((sample) => sample.id === requested)?.id ?? samples[0]?.id ?? null;
  const results = trial ? parseFormatTrialResults(trial.results) : null;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="flex max-w-5xl flex-col gap-5">
        <PageHeader
          back={{ href: editorHref, label: `${format.name} (draft)` }}
          eyebrow="Try a draft"
          title={
            format.live
              ? `Draft compared with live v${format.live.version}`
              : "Draft, not yet published"
          }
          description="Drafts a piece from one project's accepted themes and excerpts with your draft and with the live version, and shows them side by side. Nothing is added to the project, and the results are only visible to you."
          size="page"
        />

        {!format.draft && (
          <Alert variant="warning">
            You don&rsquo;t have a saved draft of this format yet.{" "}
            <Link href={editorHref} className="font-bold underline">
              Edit it
            </Link>{" "}
            first, then come back.
          </Alert>
        )}

        {samples.length === 0 || !initialProject ? (
          <EmptyState>
            There is nothing to try it on yet. A sample needs a project with at least one excerpt.
          </EmptyState>
        ) : (
          <FormatTryForm
            key={initialProject}
            formatId={formatId}
            samples={samples}
            initialProjectId={initialProject}
            hasLive={format.live !== null}
            canRun={format.draft !== null}
          />
        )}

        {trialId && !trial && (
          <Alert variant="note">
            That result is no longer available. Results are kept for {TRIAL_KEEP_DAYS} days, and
            only you can see yours.
          </Alert>
        )}

        {trial && trial.status === "failed" && (
          <Alert variant="danger">
            This trial didn&rsquo;t finish: {trial.error ?? "something went wrong"}. Run it again
            above; a failed trial costs nothing to retry.
          </Alert>
        )}
        {trial && trial.status === "running" && (
          <Alert variant="note">
            This trial is still running, or ended without finishing. Run it again to be sure.
          </Alert>
        )}

        {trial && results && (
          <>
            <FormatTrialView
              results={results}
              projectTitle={trial.projectTitle}
              direction={trial.direction}
              ranAt={trial.finishedAt ?? trial.createdAt}
            />
            {format.draft && <FormatTryActions formatId={formatId} draftSpec={format.draft.spec} />}
          </>
        )}

        <section className="flex flex-col gap-2" aria-labelledby="recent-format-trials">
          <SectionHeading id="recent-format-trials" level="eyebrow">
            Recent trials
          </SectionHeading>
          <p className="text-xs text-ink-400">Results are kept for {TRIAL_KEEP_DAYS} days.</p>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-500">No trials yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded border border-line">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={withQuery("/sourcework/editors/formats/try", {
                      format: formatId,
                      trial: entry.id,
                    })}
                    aria-current={entry.id === trialId ? "page" : undefined}
                    className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-panel-50"
                  >
                    <span className="font-semibold text-brand-link">{entry.projectTitle}</span>
                    {entry.direction && (
                      <span className="truncate text-ink-500">“{entry.direction}”</span>
                    )}
                    <span className="text-xs text-ink-400 sm:ml-auto">
                      <LocalTime iso={entry.createdAt} withDate />
                      {entry.status === "failed" && " · failed"}
                      {entry.status === "running" && " · unfinished"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
