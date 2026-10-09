import { StatTile } from "@/components/ui/stat-tile";
import { formatScore } from "@/lib/editorial/format";
import { pluralize } from "@/lib/format";

/**
 * A round's three scores as labeled stat tiles,
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
      <div className="flex flex-wrap items-start gap-2">
        <StatTile label="Core" value={formatScore(core)} />
        <StatTile label="Modifier" value={modifier === null ? "—" : formatScore(modifier)} />
        <StatTile
          label="Adjusted"
          tone="accent"
          value={
            <>
              {formatScore(adjusted)}
              {modifierApplied && (
                <span className="ml-1 text-xs" title="Modifier applied">
                  ↑
                </span>
              )}
            </>
          }
        />
      </div>
      <p className="mt-2 text-[11px] text-ink-400">
        {spread !== null && (
          <>
            Spread <span className="tabular-nums">{formatScore(spread)}</span>
            <span aria-hidden="true"> · </span>
          </>
        )}
        {pluralize(reviewerCount, "review")}
      </p>
    </div>
  );
}
