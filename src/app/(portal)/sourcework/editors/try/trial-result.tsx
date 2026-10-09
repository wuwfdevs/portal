import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { SegmentedLinks } from "@/components/ui/segmented";
import { cn } from "@/lib/cn";
import { withQuery } from "@/lib/paths";
import { formatSpans } from "@/lib/sourcework/research";
import type { PromptSlot } from "@/lib/sourcework/prompts";
import { formatElapsed, limitRows } from "@/lib/sourcework/trial-sample";
import type { TrialRecord } from "@/lib/sourcework/trial-samples";
import {
  describeTrialSide,
  filterTrialRows,
  trialRowCounts,
  type TrialFilter,
  type TrialPoint,
  type TrialRow,
} from "@/lib/sourcework/trials";
import { LocalTime } from "../local-time";

const GROUP_LABEL: Record<TrialRow["group"], string> = {
  both: "In both",
  draft_only: "Only in draft",
  live_only: "Only in live",
};

function Side({
  point,
  side,
  group,
}: {
  point: TrialPoint | null;
  side: "Live" | "Draft";
  group: TrialRow["group"];
}) {
  return (
    <div className="px-4 py-3 text-sm lg:border-r lg:border-line lg:last:border-r-0">
      <div className="text-[11px] font-bold uppercase tracking-wide text-ink-400 lg:hidden">
        {side}
      </div>
      {point ? (
        <>
          {group !== "both" && (
            <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-link">
              {point.tag}
            </div>
          )}
          <p className="text-ink-900">{point.claim}</p>
          <div className="mt-1 font-mono text-[11px] text-ink-400">
            {formatSpans(point.spans)}
            {group === "both" && point.tag && <> · {point.tag}</>}
          </div>
        </>
      ) : (
        <span className="text-ink-400">—</span>
      )}
    </div>
  );
}

/** A stored trial: the counts, the switch, and the two sides row by row. */
export function TrialResultView({
  trial,
  slot,
  show,
  all,
  retryHref,
}: {
  trial: TrialRecord;
  slot: PromptSlot;
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
  const counts = trialRowCounts(results.rows);
  const filtered = filterTrialRows(results.rows, show);
  const { shown, hidden } = limitRows(filtered, all);
  const base = (overrides: Record<string, string | undefined>) =>
    withQuery("/sourcework/editors/try", { slot, trial: trial.id, ...overrides });
  const elapsed =
    trial.finishedAt !== null
      ? formatElapsed(new Date(trial.finishedAt).getTime() - new Date(trial.createdAt).getTime())
      : null;

  return (
    <section className="flex flex-col gap-3" aria-label="Result">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
          Result · ran <LocalTime iso={trial.createdAt} />
          {elapsed && <> in {elapsed}</>} · {trial.sourceTitle}
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
              {side.label} · {side.points.length} data point{side.points.length === 1 ? "" : "s"}{" "}
              <span className="font-normal normal-case tracking-normal">
                {describeTrialSide(side.points).replace(/^\d+ data points? /, "")}
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
              <div className="font-serif text-2xl font-bold text-ink-900">{side.points.length}</div>
              <div className="text-xs text-ink-500">
                {describeTrialSide(side.points).replace(/^\d+ data points? /, "")}
              </div>
            </div>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-500">Nothing in this group.</p>
        ) : (
          shown.map((row, index) => {
            const spans = formatSpans((row.live ?? row.draft)?.spans ?? []);
            return (
              <div
                key={index}
                className={cn(
                  "border-t border-line first:border-t-0",
                  row.group !== "both" && "bg-brand-surface/20",
                )}
              >
                <div className="px-4 pt-2.5 text-[11px] font-bold uppercase tracking-wide text-ink-500 lg:hidden">
                  {GROUP_LABEL[row.group]}
                  {spans && ` · ${spans}`}
                </div>
                <div className="grid lg:grid-cols-2">
                  <Side point={row.live} side="Live" group={row.group} />
                  <Side point={row.draft} side="Draft" group={row.group} />
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-ink-400">
        Rows are matched by the transcript they point at.
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
