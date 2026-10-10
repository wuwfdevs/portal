import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { SegmentedLinks } from "@/components/ui/segmented";
import { withQuery } from "@/lib/paths";
import { describeQuoteSide, filterQuoteRows, quoteRowCounts } from "@/lib/sourcework/quote-trials";
import type { QuoteTrialRecord } from "@/lib/sourcework/quote-trial-queries";
import { formatElapsed, limitRows } from "@/lib/sourcework/trial-sample";
import type { TrialFilter } from "@/lib/sourcework/trials";
import { LocalTime } from "../local-time";
import { QuoteTrialRows } from "./quote-trial-rows";

/** A stored quote trial: the counts, the switch, and the two ranked lists row by row, each clip playable. */
export function QuoteTrialResultView({
  trial,
  show,
  all,
  retryHref,
}: {
  trial: QuoteTrialRecord;
  show: TrialFilter;
  all: boolean;
  retryHref: string;
}) {
  if (trial.status !== "succeeded" || !trial.results) {
    return (
      <Alert
        variant={trial.status === "failed" ? "danger" : "warning"}
        action={
          <Link href={retryHref} className="text-sm font-bold text-brand-link hover:underline">
            Run it again
          </Link>
        }
      >
        {trial.status === "failed"
          ? `This trial failed: ${trial.error ?? "no reason was recorded"}. Running it again costs nothing extra.`
          : "This trial didn't finish, or its result couldn't be read. Run it again."}
      </Alert>
    );
  }

  const { results } = trial;
  const counts = quoteRowCounts(results.rows);
  const filtered = filterQuoteRows(results.rows, show);
  const { shown, hidden } = limitRows(filtered, all);
  const base = (overrides: Record<string, string | undefined>) =>
    withQuery("/sourcework/editors/try", {
      slot: "quote_quality",
      trial: trial.id,
      ...overrides,
    });
  const elapsed =
    trial.finishedAt !== null
      ? formatElapsed(new Date(trial.finishedAt).getTime() - new Date(trial.createdAt).getTime())
      : null;

  return (
    <section className="flex flex-col gap-3" aria-label="Result">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
          Result · ran <LocalTime iso={trial.createdAt} />
          {elapsed && <> in {elapsed}</>} · {trial.themeTitle}
        </h2>
        <SegmentedLinks
          label="Show"
          options={[
            { label: `All · ${counts.all}`, href: base({}), active: show === "all" },
            {
              label: `Only in draft · ${counts.draft_only}`,
              href: base({ show: "draft_only" }),
              active: show === "draft_only",
            },
            {
              label: `Only in live · ${counts.live_only}`,
              href: base({ show: "live_only" }),
              active: show === "live_only",
            },
            {
              label: `In both · ${counts.both}`,
              href: base({ show: "both" }),
              active: show === "both",
            },
          ]}
        />
      </div>

      <div className="overflow-hidden rounded border border-line">
        <div className="hidden border-b border-line bg-panel-50 text-[11px] font-bold uppercase tracking-wide text-ink-500 lg:grid lg:grid-cols-2">
          {([results.live, results.draft] as const).map((side) => (
            <div key={side.label} className="border-r border-line px-4 py-2.5 last:border-r-0">
              {side.label} ·{" "}
              <span className="font-normal normal-case tracking-normal">
                {describeQuoteSide(side.quotes)}
              </span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-px bg-line text-center lg:hidden">
          {([results.live, results.draft] as const).map((side) => (
            <div key={side.label} className="bg-white px-3 py-2.5">
              <div className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                {side.label}
              </div>
              <div className="font-serif text-2xl font-bold text-ink-900">{side.quotes.length}</div>
              <div className="text-xs text-ink-500">
                {describeQuoteSide(side.quotes).replace(/^\d+ clips? ?/, "")}
              </div>
            </div>
          ))}
        </div>

        <QuoteTrialRows rows={shown} />
      </div>

      <p className="text-xs text-ink-400">
        Clips are matched by the stretch of the recording they cover.
        {hidden > 0 && (
          <>
            {" "}
            Only the first six rows are shown;{" "}
            <Link
              href={base({ show: show === "all" ? undefined : show, all: "1" })}
              className="font-bold text-brand-link hover:underline"
            >
              show all {filtered.length}
            </Link>
            .
          </>
        )}
      </p>
    </section>
  );
}
