import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "@/components/ui/progress-bar";
import { cn } from "@/lib/cn";
import { stationTodayISO } from "@/lib/log/timezone";
import { FULFILLMENT_STATUS_LABEL, type FulfillmentStatus } from "@/lib/underwriting/demand";
import {
  allSettled,
  allUntouched,
  buildPeriodRows,
  foldPeriodRows,
  formatDateRange,
  type PeriodRow,
} from "@/lib/underwriting/line-details";
import { canRewriteScheduleLine } from "@/lib/underwriting/line-mutability";
import { formatPlacementDateTime } from "@/lib/underwriting/placement";
import type {
  ContractDetail,
  PlacementWithOutcome,
  ScheduleLineDemandView,
} from "@/lib/underwriting/queries";
import { autoFillScheduleLineAction } from "../../auto-fill-actions";
import { clearCreditAction } from "../../placement-actions";
import { LineMenu } from "./line-menu";

export const FULFILLMENT_VARIANT: Record<FulfillmentStatus, BadgeVariant> = {
  no_target: "neutral",
  on_track: "accent",
  behind: "danger",
  fulfilled: "success",
};

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn("transition-transform", open && "rotate-90")}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

/**
 * One schedule line on the contract page (docs/underwriting-traffic-
 * redesign.md §11.7): a summary row — chevron, name, one rule sentence,
 * delivery bar, "⋮" — and, when `expanded`, the line's periods as one
 * table of demand and placements. Expanded state lives in the URL
 * (`?details=<lineId>`, like the Copy tab's `?edit=<id>`), never in
 * client state; so does "show every period" (`&periods=all`). Placing a
 * credit is its own page (`/lines/[lineId]/place`), reached from the
 * table; the menu keeps only auto-fill for this line, Edit, and the two
 * destructive actions.
 */
export function LineCard({
  view,
  contract,
  isCurrent,
  isDraft,
  flightNameById,
  expanded,
  showAllPeriods,
  error,
}: {
  view: ScheduleLineDemandView;
  contract: ContractDetail;
  isCurrent: boolean;
  isDraft: boolean;
  flightNameById: Map<string, string>;
  expanded: boolean;
  showAllPeriods: boolean;
  /** A failed action's message for this line, rendered inside the card. */
  error: string | null;
}) {
  const { scheduleLine, summary } = view;
  const base = `/underwriting/contracts/${contract.id}`;
  const cancelled = scheduleLine.status === "cancelled";
  const schedulable = isCurrent && !cancelled;
  const livePlacements = view.placements.filter((placement) => placement.status !== "superseded");
  const rewritable =
    !cancelled &&
    canRewriteScheduleLine({
      contractStatus: contract.status,
      revisionStatus: isDraft ? "draft" : "current",
      placementCount: livePlacements.length,
    });
  const canPlace = schedulable && contract.status === "active";
  const canAutoFill = canPlace && contract.copy.length > 0;
  const autoFillFormId = `autofill-${scheduleLine.id}`;
  const toggleHref = expanded ? base : `${base}?details=${scheduleLine.id}`;
  const needed = summary.freshShortfall;

  return (
    <li id={`line-${scheduleLine.id}`} className={cn("flex flex-col", cancelled && "opacity-60")}>
      {canAutoFill && (
        <form id={autoFillFormId} action={autoFillScheduleLineAction} className="hidden">
          <input type="hidden" name="contract_id" value={contract.id} />
          <input type="hidden" name="schedule_line_id" value={scheduleLine.id} />
        </form>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5">
        <Link
          href={`${toggleHref}#line-${scheduleLine.id}`}
          scroll={false}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} periods for ${scheduleLine.label || view.description}`}
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-panel-50",
            expanded ? "bg-panel-50 text-brand-link" : "text-ink-500",
          )}
        >
          <Chevron open={expanded} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink-900">
              {scheduleLine.label || view.description}
            </span>
            {scheduleLine.service_level === "bonus" && <Badge variant="muted">Bonus</Badge>}
            {scheduleLine.flight_id && (
              <Badge variant="neutral">
                {flightNameById.get(scheduleLine.flight_id) ?? "Flight"}
              </Badge>
            )}
            {cancelled && (
              <Badge variant="danger">cancelled from {scheduleLine.cancelled_from}</Badge>
            )}
          </div>
          <p className="mt-0.5 text-[13px] text-ink-700">
            {scheduleLine.label ? `${view.description} · ` : ""}
            {scheduleLine.duration_seconds}s ·{" "}
            {formatDateRange(scheduleLine.start_date, scheduleLine.end_date)}
          </p>
          {view.warnings.length > 0 && !cancelled && (
            <ul className="mt-2 flex flex-col gap-1">
              {view.warnings.map((warning) => (
                <li
                  key={warning.code}
                  className="rounded border border-warning-fg/30 bg-warning-fg/[0.06] px-2.5 py-1.5 text-xs text-ink-700"
                >
                  {warning.message}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="w-full sm:w-60 sm:shrink-0">
          <ProgressBar
            done={summary.delivered}
            pending={summary.scheduled}
            total={summary.expected}
            complete={summary.status === "fulfilled"}
          />
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>
              {summary.expected > 0
                ? `${summary.delivered} aired · ${summary.scheduled} scheduled · ${needed} needed`
                : "No demand"}
            </span>
            {!cancelled && (
              <Badge variant={FULFILLMENT_VARIANT[summary.status]}>
                {FULFILLMENT_STATUS_LABEL[summary.status]}
              </Badge>
            )}
          </div>
          {isDraft && (
            <p className="mt-1 text-xs text-ink-500">Schedules once the revision is activated.</p>
          )}
        </div>

        <LineMenu
          label={`More actions for ${scheduleLine.label || view.description}`}
          contractId={contract.id}
          lineId={scheduleLine.id}
          autoFillFormId={canAutoFill ? autoFillFormId : null}
          edit={
            cancelled
              ? null
              : rewritable
                ? { href: `${base}/lines/${scheduleLine.id}/edit` }
                : {
                    reason:
                      livePlacements.length > 0
                        ? "Not available once credits are scheduled"
                        : "Only while the contract or revision is a draft",
                  }
          }
          canCancel={schedulable}
          canRemove={rewritable}
          defaultCancelFrom={stationTodayISO()}
        />

        {error && (
          <div className="basis-full">
            <Alert>{error}</Alert>
          </div>
        )}
      </div>

      {expanded && (
        <LineDetails
          view={view}
          contract={contract}
          base={base}
          canPlace={canPlace}
          canClear={schedulable}
          showAll={showAllPeriods}
        />
      )}
    </li>
  );
}

const PLACEMENT_BADGE: Record<
  PlacementWithOutcome["outcome"],
  { label: string; variant: BadgeVariant }
> = {
  pending: { label: "Scheduled", variant: "accent" },
  aired: { label: "Aired", variant: "success" },
  not_aired: { label: "Not aired", variant: "danger" },
};

type DetailLine<P extends PlacementWithOutcome> =
  | { kind: "placement"; placement: P }
  | { kind: "needed" }
  | { kind: "makegood" }
  | { kind: "none" };

function detailLines<P extends PlacementWithOutcome>(row: PeriodRow<P>): DetailLine<P>[] {
  const lines: DetailLine<P>[] = row.placements.map((placement) => ({
    kind: "placement" as const,
    placement,
  }));
  if (row.needed > 0) lines.push({ kind: "needed" });
  if (row.makegoodsAwaitingSlot > 0) lines.push({ kind: "makegood" });
  if (lines.length === 0) lines.push({ kind: "none" });
  return lines;
}

/**
 * The line's periods as one table: each period's owed count, and per unit
 * a placement (when, where, which message, its outcome, Clear) or the
 * open unit it still needs (Place). Settled history and untouched future
 * fold to one line each unless `showAll`.
 */
function LineDetails({
  view,
  contract,
  base,
  canPlace,
  canClear,
  showAll,
}: {
  view: ScheduleLineDemandView;
  contract: ContractDetail;
  base: string;
  canPlace: boolean;
  canClear: boolean;
  showAll: boolean;
}) {
  const lineId = view.scheduleLine.id;
  const rows = buildPeriodRows(view.buckets, view.placements);
  const folded = showAll
    ? { earlier: [] as PeriodRow<PlacementWithOutcome>[], shown: rows, later: [] }
    : foldPeriodRows(rows);
  const copyLabelById = new Map(contract.copy.map((item) => [item.id, item.label]));
  const placeHref = (bucketId?: string) =>
    `${base}/lines/${lineId}/place${bucketId ? `?week=${bucketId}` : ""}`;
  const allHref = `${base}?details=${lineId}&periods=all#line-${lineId}`;
  const cellClass = "px-3.5 py-2 align-top";
  const notes = [
    view.scheduleLine.source_text ? `“${view.scheduleLine.source_text}”` : null,
    view.scheduleLine.makegood_policy_text
      ? `Makegoods: ${view.scheduleLine.makegood_policy_text}`
      : null,
    view.scheduleLine.stated_total != null
      ? `${view.scheduleLine.stated_total} spots on the order`
      : null,
  ].filter((note): note is string => note !== null);

  return (
    <div className="mr-4 mb-4 ml-[3.75rem] overflow-hidden rounded border border-line">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-panel-50 px-3.5 py-2.5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-500">
            {rows.length} period{rows.length === 1 ? "" : "s"}
          </span>
          {notes.length > 0 && <span className="text-xs text-ink-500">{notes.join(" · ")}</span>}
        </div>
        <div className="flex items-center gap-4">
          {canPlace && (
            <Link href={placeHref()} className="text-xs font-bold text-brand-link hover:underline">
              Place a credit
            </Link>
          )}
          <Link
            href={`${base}?tab=placements`}
            className="text-xs font-semibold text-brand-link hover:underline"
          >
            Open on the Placements tab
          </Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="px-3.5 py-3 text-xs text-ink-500">This line compiles to no demand.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink-500">
                <th className={cn(cellClass, "font-semibold")}>Period</th>
                <th className={cn(cellClass, "text-right font-semibold")}>Owed</th>
                <th className={cn(cellClass, "font-semibold")}>Placement</th>
                <th className={cn(cellClass, "font-semibold")}>Message</th>
                <th className={cn(cellClass, "font-semibold")}>Status</th>
                <th className={cellClass} />
              </tr>
            </thead>
            <tbody>
              {folded.earlier.length > 0 && (
                <tr className="border-t border-line">
                  <td colSpan={6} className={cn(cellClass, "text-xs")}>
                    <Link href={allHref} scroll={false} className="font-semibold text-brand-link">
                      Show {folded.earlier.length} earlier period
                      {folded.earlier.length === 1 ? "" : "s"}
                      {allSettled(folded.earlier) ? ", all aired" : ""}
                    </Link>
                  </td>
                </tr>
              )}
              {folded.shown.map((row) => {
                const lines = detailLines(row);
                const inactive = row.kind === "inactive";
                return lines.map((line, index) => (
                  <tr
                    key={`${row.bucketId}-${index}`}
                    className={cn(
                      index === 0 && "border-t border-line",
                      inactive && "text-ink-400 line-through",
                      !inactive && row.needed > 0 && "bg-warning-bg/40",
                    )}
                  >
                    {index === 0 && (
                      <>
                        <td
                          rowSpan={lines.length}
                          className={cn(cellClass, "whitespace-nowrap font-semibold text-ink-900")}
                        >
                          {row.label}
                          {inactive && (
                            <span className="ml-1 font-normal no-underline">
                              ({row.bucketStatus})
                            </span>
                          )}
                        </td>
                        <td rowSpan={lines.length} className={cn(cellClass, "text-right")}>
                          {row.quantity}
                        </td>
                      </>
                    )}
                    {line.kind === "placement" ? (
                      <>
                        <td className={cn(cellClass, "text-ink-700")}>
                          <span className="whitespace-nowrap font-semibold text-ink-900">
                            {formatPlacementDateTime(line.placement.scheduled_at)}
                          </span>{" "}
                          · {line.placement.program_name}
                          {line.placement.break_label ? ` · ${line.placement.break_label}` : ""}
                        </td>
                        <td className={cn(cellClass, "text-ink-700")}>
                          {copyLabelById.get(line.placement.copy_id) ?? "—"}
                          {line.placement.override_reason && (
                            <span className="block text-xs text-warning-fg">
                              override: {line.placement.override_reason}
                            </span>
                          )}
                        </td>
                        <td className={cellClass}>
                          <span className="flex flex-wrap gap-1">
                            <Badge variant={PLACEMENT_BADGE[line.placement.outcome].variant}>
                              {PLACEMENT_BADGE[line.placement.outcome].label}
                            </Badge>
                            {line.placement.makegood_id && (
                              <Badge variant="warning">makegood</Badge>
                            )}
                          </span>
                        </td>
                        <td className={cn(cellClass, "text-right")}>
                          {canClear && line.placement.outcome === "pending" && (
                            <form action={clearCreditAction}>
                              <input type="hidden" name="contract_id" value={contract.id} />
                              <input type="hidden" name="schedule_line_id" value={lineId} />
                              <input type="hidden" name="placement_id" value={line.placement.id} />
                              <Button type="submit" variant="ghost" className="py-0.5 text-xs">
                                Clear
                              </Button>
                            </form>
                          )}
                        </td>
                      </>
                    ) : line.kind === "needed" ? (
                      <>
                        <td colSpan={2} className={cn(cellClass, "italic text-ink-500")}>
                          Nothing scheduled
                        </td>
                        <td className={cellClass}>
                          <Badge variant="warning">{row.needed} needed</Badge>
                        </td>
                        <td className={cn(cellClass, "text-right")}>
                          {canPlace && (
                            <Link
                              href={placeHref(row.bucketId)}
                              className="inline-flex items-center rounded border border-brand-link px-2.5 py-0.5 text-xs font-bold text-brand-link hover:bg-brand-surface"
                            >
                              Place
                            </Link>
                          )}
                        </td>
                      </>
                    ) : line.kind === "makegood" ? (
                      <td colSpan={4} className={cn(cellClass, "text-xs text-ink-500")}>
                        {row.makegoodsAwaitingSlot} makegood
                        {row.makegoodsAwaitingSlot === 1 ? "" : "s"} awaiting a slot —{" "}
                        <Link
                          href="/underwriting/makegoods"
                          className="font-semibold text-brand-link"
                        >
                          Makegoods
                        </Link>
                      </td>
                    ) : (
                      <td colSpan={4} className={cn(cellClass, "text-ink-400")}>
                        —
                      </td>
                    )}
                  </tr>
                ));
              })}
              {folded.later.length > 0 && (
                <tr className="border-t border-line">
                  <td colSpan={6} className={cn(cellClass, "text-xs")}>
                    <Link href={allHref} scroll={false} className="font-semibold text-brand-link">
                      Show {folded.later.length} more period
                      {folded.later.length === 1 ? "" : "s"}
                      {allUntouched(folded.later) ? ", all still needed" : ""}
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
