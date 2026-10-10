import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { SectionHeading } from "@/components/ui/section-heading";
import { withQuery } from "@/lib/paths";
import type { SourceworkContext } from "@/lib/sourcework/access";
import { getLivePrompt, getPromptDraft } from "@/lib/sourcework/research-queries";
import { uuidParam } from "@/lib/sourcework/route-input";
import { pickDefaultQuoteSample } from "@/lib/sourcework/quote-trials";
import {
  getQuoteTrial,
  listQuoteTrialSamples,
  listRecentQuoteTrials,
} from "@/lib/sourcework/quote-trial-queries";
import { parseTrialShow, trialHeading } from "@/lib/sourcework/trial-sample";
import { TRIAL_KEEP_DAYS } from "@/lib/sourcework/trials";
import { LocalTime } from "../local-time";
import { QuoteTrialResultView } from "./quote-trial-result";
import { QuoteTryForm } from "./quote-try-form";
import { TryActions } from "./try-actions";

const SLOT = "quote_quality";

/**
 * Try this draft for the quote quality guide (docs/sourcework-analysis-design.md §8.1): the sample is
 * a theme, and the comparison is two ranked lists of clips, each playable. Nothing is added to any
 * project, and the results are only visible to the editor who ran them.
 */
export async function QuoteTry({
  context,
  params,
}: {
  context: SourceworkContext;
  params: { trial?: string; show?: string; all?: string; project?: string; theme?: string };
}) {
  const userId = context.profile.id;
  const trialId = uuidParam(params.trial);
  const [live, draft, samples, recent, trial] = await Promise.all([
    getLivePrompt(SLOT),
    getPromptDraft(SLOT, userId),
    listQuoteTrialSamples(),
    listRecentQuoteTrials(userId),
    trialId ? getQuoteTrial(trialId, userId) : Promise.resolve(null),
  ]);

  const last = recent[0] ? { projectId: recent[0].projectId, themeId: recent[0].themeId } : null;
  const requested =
    uuidParam(params.project) && uuidParam(params.theme)
      ? { projectId: params.project!, themeId: params.theme! }
      : last;
  const sample = pickDefaultQuoteSample(samples, requested);
  const recentSamples = [...new Set(recent.map((entry) => entry.themeTitle))].slice(0, 3);
  const editorHref = `/sourcework/editors?slot=${SLOT}`;

  return (
    <div className="px-6 py-10 sm:px-10 sm:py-12">
      <div className="flex max-w-4xl flex-col gap-5">
        <PageHeader
          back={{ href: editorHref, label: "Quote quality guide (draft)" }}
          eyebrow="Try a draft"
          title={trialHeading(live.version)}
          description="Runs your draft and the live version on the same theme and shows the clips each would suggest. Nothing is added to any project, and the results are only visible to you."
          size="page"
        />

        {!draft && (
          <Alert variant="warning">
            You don&rsquo;t have a saved draft yet.{" "}
            <Link href={editorHref} className="font-bold underline">
              Edit the guide
            </Link>{" "}
            first, then come back.
          </Alert>
        )}

        {samples.length === 0 || !sample ? (
          <EmptyState>
            There is nothing to try it on yet. A sample needs an accepted theme with accepted data
            points behind it.
          </EmptyState>
        ) : (
          <QuoteTryForm
            key={`${sample.projectId}:${sample.themeId}`}
            samples={samples}
            initialProjectId={sample.projectId}
            initialThemeId={sample.themeId}
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
            <QuoteTrialResultView
              trial={trial}
              show={parseTrialShow(params.show)}
              all={params.all === "1"}
              retryHref={withQuery("/sourcework/editors/try", {
                slot: SLOT,
                project: trial.projectId,
                theme: trial.themeId,
              })}
            />
            {draft && <TryActions slot={SLOT} draftBody={draft.body} />}
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
                    href={withQuery("/sourcework/editors/try", { slot: SLOT, trial: entry.id })}
                    aria-current={entry.id === trialId ? "page" : undefined}
                    className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-0.5 px-4 py-2.5 text-sm hover:bg-panel-50"
                  >
                    <span className="font-semibold text-brand-link">{entry.themeTitle}</span>
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
