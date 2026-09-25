import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { autoFillAllAction } from "./auto-fill-actions";
import {
  buildScheduleLineDemandViews,
  listAllocationsForLines,
  listContracts,
  listCopy,
  listCopyLinkedToContracts,
  listExceptions,
  listInventoryPools,
  listScheduleLinePlacementContexts,
  listScheduleLinesWithActiveContracts,
  type ScheduleLineDemandView,
} from "@/lib/underwriting/queries";
import { listProgramOptions } from "@/lib/underwriting/placement";
import { computeScheduleLineConflicts, CONFLICT_LABEL } from "@/lib/underwriting/conflicts";
import { addDays } from "@/lib/underwriting/demand";
import { stationTodayISO } from "@/lib/log/timezone";

/** How far ahead an open, unfillable period counts as a conflict worth flagging today. */
const LOOK_AHEAD_DAYS = 14;

/**
 * "The two queues that actually need daily attention: schedule lines that
 * can't currently be placed, and broadcast events awaiting exception
 * resolution" (docs/underwriting-design.md §4). The conflict check
 * (lib/underwriting/conflicts.ts) is scoped to what this schema can
 * actually verify: approved linked copy, a decided separation policy, a
 * candidate break for every period short within the next two weeks, and
 * no makegood stuck waiting on the agency.
 */
export default async function UnderwritingDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  const [contracts, copy, scheduleLines, openExceptions, pools, programs] = await Promise.all([
    listContracts(),
    listCopy(),
    listScheduleLinesWithActiveContracts(),
    listExceptions(),
    listInventoryPools(),
    listProgramOptions(),
  ]);
  const unresolvedExceptions = openExceptions.filter(
    (exception) => exception.resolution_status === "open",
  );

  const contractIds = [...new Set(scheduleLines.map((line) => line.contract_id))];
  const [copyByContract, allocationsByLine, lineContexts] = await Promise.all([
    listCopyLinkedToContracts(contractIds),
    listAllocationsForLines(scheduleLines.map((line) => line.id)),
    listScheduleLinePlacementContexts(scheduleLines),
  ]);
  const names = {
    poolNameById: new Map(pools.map((pool) => [pool.id, pool.name])),
    programNameById: new Map(programs.map((program) => [program.id, program.name])),
  };
  const views: ScheduleLineDemandView[] = [];
  for (const contractId of contractIds) {
    const contract = scheduleLines.find((line) => line.contract_id === contractId)!.contract;
    const lines = scheduleLines.filter((line) => line.contract_id === contractId);
    views.push(...(await buildScheduleLineDemandViews(contract, lines, allocationsByLine, names)));
  }
  const placeableByLine = new Map(
    lineContexts.map((context) => [context.scheduleLine.id, context.placeable]),
  );
  const contractByLine = new Map(scheduleLines.map((line) => [line.id, line.contract]));

  const todayISO = stationTodayISO();
  const horizon = addDays(todayISO, LOOK_AHEAD_DAYS);
  const conflicts = views
    .map((view) => {
      const contract = contractByLine.get(view.scheduleLine.id)!;
      const linkedCopy = copyByContract.get(contract.id) ?? [];
      const placeable = placeableByLine.get(view.scheduleLine.id);
      const reasons = computeScheduleLineConflicts({
        hasApprovedLinkedCopy: linkedCopy.some(
          ({ copy: item, flightId }) =>
            item.approval_status === "approved" &&
            (flightId === null || flightId === view.scheduleLine.flight_id),
        ),
        separationUndecided:
          Boolean(contract.separation_source_text) && contract.separation_policy === "unspecified",
        periodsShortSoon: view.periods.filter(
          (period) => period.periodEnd >= todayISO && period.periodStart <= horizon,
        ),
        datesWithInventory: new Set(
          placeable?.ok ? placeable.breaks.map((brk) => brk.air_date) : [],
        ),
        makegoodsPendingApproval: view.openItems.makegoodsPendingApproval,
      });
      return { view, contract, reasons };
    })
    .filter((check) => check.reasons.length > 0);

  const activeContracts = contracts.filter((contract) => contract.status === "active").length;
  const draftContracts = contracts.filter((contract) => contract.status === "draft").length;
  const copyPendingApproval = copy.filter((item) => item.approval_status === "draft").length;
  const copyApproved = copy.filter((item) => item.approval_status === "approved").length;
  const unplacedUnits = views.reduce(
    (sum, view) =>
      sum +
      view.periods.filter((p) => p.periodEnd >= todayISO).reduce((s, p) => s + p.freshShortfall, 0),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert variant="info">{notice}</Alert>}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-line p-4">
        <div>
          <div className="text-sm font-semibold text-ink-900">Auto-fill scheduling</div>
          <p className="text-xs text-ink-500">
            Fills every open period of every active contract to what the order calls for — makegoods
            first — spreading credits across eligible days and generating the Log rundowns it needs.
            Never the same underwriter twice in a break, never next to the same industry, and never
            past a period&apos;s quantity or a day&apos;s cap: the database checks the same limits
            the planner does.
          </p>
        </div>
        <form action={autoFillAllAction}>
          <Button type="submit">Auto-fill everything</Button>
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{activeContracts}</div>
          <div className="text-xs text-ink-400">Active contracts</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{draftContracts}</div>
          <div className="text-xs text-ink-400">Draft contracts</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{unplacedUnits}</div>
          <div className="text-xs text-ink-400">Open units still unscheduled</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{copyApproved}</div>
          <div className="text-xs text-ink-400">Approved copy</div>
        </div>
        <div className="rounded border border-line p-4">
          <div className="text-2xl font-bold text-ink-900">{copyPendingApproval}</div>
          <div className="text-xs text-ink-400">Copy awaiting approval</div>
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
            Pre-broadcast conflicts
          </h2>
          {conflicts.length > 0 && <Badge variant="danger">{conflicts.length}</Badge>}
        </div>
        {conflicts.length === 0 ? (
          <p className="text-sm text-ink-500">
            No active schedule line is currently blocked from placement.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {conflicts.map(({ view, contract, reasons }) => (
              <li
                key={view.scheduleLine.id}
                className="rounded border border-danger/30 bg-danger/[0.04] p-3 text-sm"
              >
                <Link
                  href={`/underwriting/contracts/${contract.id}`}
                  className="font-semibold text-brand-link"
                >
                  {contract.underwriter.name} — {view.scheduleLine.label || view.description}
                </Link>
                <ul className="mt-1 list-disc pl-5 text-xs text-ink-700">
                  {reasons.map((reason) => (
                    <li key={reason}>{CONFLICT_LABEL[reason]}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
            Open exceptions
          </h2>
          {unresolvedExceptions.length > 0 && (
            <Badge variant="warning">{unresolvedExceptions.length}</Badge>
          )}
        </div>
        {unresolvedExceptions.length === 0 ? (
          <p className="text-sm text-ink-500">Nothing awaiting resolution.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {unresolvedExceptions.slice(0, 5).map((exception) => (
              <li key={exception.id} className="flex items-center gap-2.5 text-sm">
                <Link
                  href={`/underwriting/exceptions/${exception.id}`}
                  className="font-semibold text-brand-link"
                >
                  {exception.contract.underwriter.name}
                </Link>
                <span className="text-ink-400">{exception.scheduleLine.label}</span>
                <Badge variant="warning">{exception.host_action.replace(/_/g, " ")}</Badge>
                {exception.makegood_approval === "pending" && (
                  <Badge variant="neutral">agency approval pending</Badge>
                )}
              </li>
            ))}
            {unresolvedExceptions.length > 5 && (
              <li>
                <Link
                  href="/underwriting/exceptions"
                  className="text-xs font-semibold text-brand-link"
                >
                  See all {unresolvedExceptions.length} →
                </Link>
              </li>
            )}
          </ul>
        )}
      </div>

      {contracts.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-400">
            Recently added contracts
          </h2>
          <ul className="flex flex-col gap-2">
            {contracts.slice(0, 5).map((contract) => (
              <li key={contract.id} className="flex items-center gap-2.5 text-sm">
                <Link
                  href={`/underwriting/contracts/${contract.id}`}
                  className="font-semibold text-brand-link"
                >
                  {contract.underwriter.name}
                </Link>
                <span className="text-ink-400">{contract.contract_identifier}</span>
                <Badge variant={contract.status === "active" ? "success" : "neutral"}>
                  {contract.status}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
