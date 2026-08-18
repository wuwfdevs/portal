import { formatScore } from "@/lib/editorial/format";

/**
 * A round's three scores as labeled stat blocks split by hairline dividers,
 * with the spread/review count as a caption underneath. Core, the
 * institutional modifier, and the adjusted priority score stay three distinct
 * numbers — the modifier never edits the core score, it only adds to a
 * separate total (design §4A) — and adjusted carries the brand accent because
 * it is the one the ranked agenda is ordered by.
 *
 * Shared by the pitch detail screen's review history and the meeting agenda so
 * the same round reads identically in both places.
 */
export function ScoreStats({
  core,
  modifier,
  adjusted,
  spread,
  reviewerCount,
  modifierApplied = false,
}: {
  core: number | null;
  modifier: number | null;
  adjusted: number | null;
  spread: number | null;
  reviewerCount: number;
  modifierApplied?: boolean;
}) {
  return (
    <div>
      <dl className="flex flex-wrap items-start">
        <Stat label="Core" value={formatScore(core)} />
        <Divider />
        <Stat label="Modifier" value={modifier === null ? "—" : formatScore(modifier)} />
        <Divider />
        <Stat label="Adjusted" value={formatScore(adjusted)} accent>
          {modifierApplied && (
            <span className="ml-1 text-xs" title="Modifier applied">
              ↑
            </span>
          )}
        </Stat>
      </dl>
      <p className="mt-2 text-[11px] text-ink-400">
        {spread !== null && (
          <>
            Spread <span className="tabular-nums">{formatScore(spread)}</span>
            <span aria-hidden="true"> · </span>
          </>
        )}
        {reviewerCount} {reviewerCount === 1 ? "review" : "reviews"}
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
  children,
}: {
  label: string;
  value: string;
  accent?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="pr-4">
      <dt
        className={
          accent
            ? "text-[10px] font-bold uppercase tracking-wider text-brand-link"
            : "text-[10px] font-bold uppercase tracking-wider text-ink-400"
        }
      >
        {label}
      </dt>
      <dd
        className={
          accent
            ? "mt-0.5 font-serif text-[19px] font-bold tabular-nums text-brand-link"
            : "mt-0.5 font-serif text-[19px] font-bold tabular-nums text-ink-900"
        }
      >
        {value}
        {children}
      </dd>
    </div>
  );
}

function Divider() {
  return <div aria-hidden="true" className="mr-4 w-px self-stretch bg-line" />;
}
