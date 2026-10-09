import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { withQuery } from "@/lib/paths";
import { requireSourceworkEditor } from "@/lib/sourcework/access";
import { promptSlotDefinition } from "@/lib/sourcework/prompts";
import { getLivePrompt, getPromptDraft } from "@/lib/sourcework/research-queries";
import { uuidParam } from "@/lib/sourcework/route-input";
import { pickDefaultSample, parseTrialShow, trialHeading } from "@/lib/sourcework/trial-sample";
import { getTrial, listRecentTrials, listTrialSamples } from "@/lib/sourcework/trial-samples";
import { TRIAL_KEEP_DAYS } from "@/lib/sourcework/trials";
import { LocalTime } from "../local-time";
import { TryActions } from "./try-actions";
import { TryForm } from "./try-form";
import { TrialResultView } from "./trial-result";

export const metadata = { title: "Try a draft" };
// The trial itself runs in its own route (maxDuration 300); this page only reads.

export default async function TryPage({
  searchParams,
}: {
  searchParams: Promise<{
    slot?: string;
    trial?: string;
    show?: string;
    all?: string;
    project?: string;
    source?: string;
  }>;
}) {
  const context = await requireSourceworkEditor();
  if (!context) notFound();
  const params = await searchParams;
  const definition = promptSlotDefinition(params.slot);
  if (!definition || !definition.tryable) notFound();
  const slot = definition.slot;
  const userId = context.profile.id;

  const trialId = uuidParam(params.trial);
  const [live, draft, samples, recent, trial] = await Promise.all([
    getLivePrompt(slot),
    getPromptDraft(slot, userId),
    listTrialSamples(),
    listRecentTrials(userId, slot),
    trialId ? getTrial(trialId, userId, slot) : Promise.resolve(null),
  ]);

  const last = recent[0] ? { projectId: recent[0].projectId, sourceId: recent[0].sourceId } : null;
  const requested =
    uuidParam(params.project) && uuidParam(params.source)
      ? { projectId: params.project!, sourceId: params.source! }
      : last;
  const sample = pickDefaultSample(samples, requested);
  const recentSamples = [...new Set(recent.map((entry) => entry.sourceTitle))].slice(0, 3);
  const editorHref = `/sourcework/editors?slot=${slot}`;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="flex max-w-4xl flex-col gap-5">
        <PageHeader
          back={{ href: editorHref, label: `${definition.label} (draft)` }}
          eyebrow="Try a draft"
          title={trialHeading(live.version)}
          description="Runs your draft and the live version on the same source and shows what changed. Nothing is added to any project, and the results are only visible to you."
          size="page"
        />

        {!draft && (
          <Alert variant="warning">
            You don&rsquo;t have a saved draft yet.{" "}
            <Link href={editorHref} className="font-bold underline">
              Edit the prompt
            </Link>{" "}
            first, then come back.
          </Alert>
        )}

        {samples.length === 0 || !sample ? (
          <EmptyState>
            There is nothing to try it on yet. A sample needs a project with at least one research
            question and at least one source that has finished processing.
          </EmptyState>
        ) : (
          <TryForm
            key={`${sample.projectId}:${sample.sourceId}`}
            slot={slot}
            samples={samples}
            initialProjectId={sample.projectId}
            initialSourceId={sample.sourceId}
            recentSamples={recentSamples}
            canRun={draft !== null}
          />
        )}

        {trialId && !trial && (
          <Alert variant="note">
            That result is no longer available. Results are kept for {TRIAL_KEEP_DAYS} days, and
            only you can see yours.
          </Alert>
        )}

        {trial && (
          <>
            <TrialResultView
              trial={trial}
              slot={slot}
              show={parseTrialShow(params.show)}
              all={params.all === "1"}
              retryHref={withQuery("/sourcework/editors/try", {
                slot,
                project: trial.projectId,
                source: trial.sourceId,
              })}
            />
            {draft && <TryActions slot={slot} draftBody={draft.body} />}
          </>
        )}

        <section className="flex flex-col gap-2" aria-labelledby="recent-trials">
          <SectionHeading id="recent-trials" level="eyebrow">
            Recent trials
          </SectionHeading>
          <p className="text-xs text-ink-400">
            Results are kept for {TRIAL_KEEP_DAYS} days under Recent trials.
          </p>
          {recent.length === 0 ? (
            <p className="text-sm text-ink-500">No trials yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded border border-line">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <Link
                    href={withQuery("/sourcework/editors/try", { slot, trial: entry.id })}
                    aria-current={entry.id === trialId ? "page" : undefined}
                    className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-panel-50"
                  >
                    <span className="font-semibold text-brand-link">{entry.sourceTitle}</span>
                    <span className="text-ink-500">{entry.projectTitle}</span>
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
