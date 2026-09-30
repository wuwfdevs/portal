import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import type { UwContractStatus } from "@/lib/database.types";
import { autoFillAllAction } from "./auto-fill-actions";
import {
  buildScheduleLineDemandViews,
  listBucketsForLines,
  listContracts,
  listCopy,
  listCopyLinkedToContracts,
  listExceptions,
  listInventoryPools,
  listScheduleLinePlacementContexts,
  listScheduleLinesWithActiveContracts,
  type ScheduleLineDemandView,
} from "@/lib/underwriting/queries";
import { formatPlacementTime, listProgramOptions } from "@/lib/underwriting/placement";
import { computeScheduleLineConflicts, CONFLICT_LABEL } from "@/lib/underwriting/conflicts";
import { poolReachability } from "@/lib/underwriting/pool-targets";
import { addDays, describeScheduleLine } from "@/lib/underwriting/demand";
import { isFixedPosition } from "@/lib/underwriting/fill-order";
import { automationBlockFor } from "@/lib/underwriting/freeze";
import { stationTodayISO } from "@/lib/log/timezone";
import { matchesExceptionFilter } from "@/lib/underwriting/exception-filters";

/** How far ahead an open, unfillable period counts as a conflict worth flagging today. */
const LOOK_AHEAD_DAYS = 14;
/** Open exceptions listed inline; the rest are one link away. */
const EXCEPTIONS_SHOWN = 5;

const CONTRACT_STATUS_VARIANT: Record<UwContractStatus, BadgeVariant> = {
  draft: "neutral",
  active: "success",
  expired: "muted",
  terminated: "danger",
};

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
  const [copyByContract, bucketsByLine, lineContexts] = await Promise.all([
    listCopyLinkedToContracts(contractIds),
    listBucketsForLines(scheduleLines.map((line) => line.id)),
    listScheduleLinePlacementContexts(scheduleLines),
  ]);
  const poolById = new Map(pools.map((pool) => [pool.id, pool]));
  const names = {
    poolNameById: new Map(pools.map((pool) => [pool.id, pool.name])),
    programNameById: new Map(programs.map((program) => [program.id, program.name])),
  };
  const views: ScheduleLineDemandView[] = [];
  for (const contractId of contractIds) {
    const contract = scheduleLines.find((line) => line.contract_id === contractId)!.contract;
    const lines = scheduleLines.filter((line) => line.contract_id === contractId);
    views.push(...(await buildScheduleLineDemandViews(contract, lines, bucketsByLine, names)));
  }
  const placeableByLine = new Map(
    lineContexts.map((context) => [context.scheduleLine.id, context.placeable]),
  );
  const contractByLine = new Map(scheduleLines.map((line) => [line.id, line.contract]));

  const todayISO = stationTodayISO();
  const nowISO = new Date().toISOString();
  const horizon = addDays(todayISO, LOOK_AHEAD_DAYS);
  const conflicts = views
    .map((view) => {
      const contract = contractByLine.get(view.scheduleLine.id)!;
      const linkedCopy = copyByContract.get(contract.id) ?? [];
      const placeable = placeableByLine.get(view.scheduleLine.id);
      const approvedDurations = linkedCopy
        .filter(
          ({ copy: item, flightId }) =>
            item.approval_status === "approved" &&
            item.duration_seconds != null &&
            (flightId === null || flightId === view.scheduleLine.flight_id),
        )
        .map(({ copy: item }) => item.duration_seconds as number);
      const reasons = computeScheduleLineConflicts({
        hasApprovedLinkedCopy: linkedCopy.some(
          ({ copy: item, flightId }) =>
            item.approval_status === "approved" &&
            (flightId === null || flightId === view.scheduleLine.flight_id),
        ),
        isFixedPosition: isFixedPosition(view.scheduleLine),
        candidateBreaks: placeable?.ok
          ? placeable.breaks.map((brk) => ({
              airDate: brk.air_date,
              remainingSeconds: brk.remaining_seconds,
              openToAutomation:
                automationBlockFor(
                  { rundownStatus: brk.rundown_status, scheduledAt: brk.scheduled_at },
                  nowISO,
                ) === null,
            }))
          : [],
        shortestApprovedCopySeconds:
          approvedDurations.length > 0 ? Math.min(...approvedDurations) : null,
        separationUndecided:
          Boolean(contract.separation_source_text) && contract.separation_policy === "unspecified",
        bucketsShortSoon: view.buckets.filter(
          (bucket) =>
            bucket.status === "active" &&
            bucket.periodEnd >= todayISO &&
            bucket.periodStart <= horizon,
        ),
        datesWithInventory: new Set(
          placeable?.ok ? placeable.breaks.map((brk) => brk.air_date) : [],
        ),
        makegoodsPendingApproval: view.openItems.makegoodsPendingApproval,
        poolReachability: view.scheduleLine.pool_id
          ? poolReachability(
              poolById.get(view.scheduleLine.pool_id)?.targets ?? [],
              view.scheduleLine,
            )
          : undefined,
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
      view.buckets.filter((b) => b.periodEnd >= todayISO).reduce((s, b) => s + b.freshShortfall, 0),
    0,
  );
  // Counted per exception, the same rule as the Exceptions list's
  // "Agency approval pending" filter the tile links to.
  const makegoodsPendingApproval = openExceptions.filter((exception) =>
    matchesExceptionFilter(exception, "agency_pending"),
  ).length;
  const makegoodsAwaitingSlot = views.reduce(
    (sum, view) => sum + view.openItems.awaitingSlot.length,
    0,
  );
  const capacityConflicts = conflicts.filter((check) =>
    check.reasons.includes("capacity_conflict"),
  ).length;

  // What needs action, first (2026-09-25, after comparing against
  // RadioTraffic's own attention-first dashboard): each figure links to
  // the screen where it is worked.
  const attention: {
    label: string;
    count: number;
    href: string;
    tone: "danger" | "warning" | "neutral";
  }[] = [
    {
      label: "Open exceptions",
      count: unresolvedExceptions.length,
      href: "/underwriting/exceptions?status=open",
      tone: "warning",
    },
    {
      label: "Makegoods pending agency approval",
      count: makegoodsPendingApproval,
      href: "/underwriting/exceptions?status=agency_pending",
      tone: "warning",
    },
    {
      label: "Makegoods awaiting a slot",
      count: makegoodsAwaitingSlot,
      href: "/underwriting/makegoods",
      tone: "warning",
    },
    {
      label: "Open units still unscheduled",
      count: unplacedUnits,
      href: "/underwriting/contracts",
      tone: "neutral",
    },
    { label: "Capacity conflicts", count: capacityConflicts, href: "#conflicts", tone: "danger" },
  ];
  const allClear = attention.every((item) => item.count === 0) && conflicts.length === 0;

  return (
    <div className="flex flex-col gap-6">
      {notice && <Alert variant="info">{notice}</Alert>}

      <section aria-labelledby="attention">
        <SectionHeading id="attention">Needs attention</SectionHeading>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {attention.map((item) => {
            const flagged = item.count > 0 && item.tone !== "neutral";
            return (
              <li key={item.label} className="last:col-span-2 sm:last:col-span-1">
                <Link
                  href={item.href}
                  className={cn(
                    "flex h-full flex-col gap-1 rounded border border-l-4 bg-white px-4 py-3 transition-colors hover:bg-panel-50",
                    flagged
                      ? item.tone === "danger"
                        ? "border-danger/30 border-l-danger"
                        : "border-line border-l-warning-fg"
                      : "border-line border-l-line",
                  )}
                >
                  <span
                    className={cn(
                      "text-2xl font-bold tabular-nums",
                      flagged
                        ? item.tone === "danger"
                          ? "text-danger"
                          : "text-warning-fg"
                        : item.count === 0
                          ? "text-ink-400"
                          : "text-ink-900",
                    )}
                  >
                    {item.count}
                  </span>
                  <span className="text-xs leading-snug text-ink-500">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
        {allClear && (
          <p className="mt-2 text-xs text-ink-500">
            Nothing needs attention — every open period is scheduled and nothing is blocked.
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <section id="conflicts" aria-labelledby="conflicts-heading" className="scroll-mt-4">
            <SectionHeading
              id="conflicts-heading"
              count={conflicts.length}
              countVariant="danger"
              hint={`Active schedule lines that can't be placed, looking ${LOOK_AHEAD_DAYS} days ahead`}
            >
              Pre-broadcast conflicts
            </SectionHeading>
            {conflicts.length === 0 ? (
              <EmptyState>No active schedule line is currently blocked from placement.</EmptyState>
            ) : (
              <TableFrame>
                <Table>
                  <thead>
                    <HeaderRow>
                      <Th>Underwriter · line</Th>
                      <Th>What&apos;s blocking it</Th>
                      <Th className="sr-only">Open</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {conflicts.map(({ view, contract, reasons }) => (
                      <Row key={view.scheduleLine.id}>
                        <Cell className="min-w-[12rem]">
                          <div className="font-semibold text-ink-900">
                            {contract.underwriter.name}
                          </div>
                          <div className="text-xs text-ink-500">
                            {view.scheduleLine.label || view.description}
                          </div>
                        </Cell>
                        <Cell>
                          <ul className="flex flex-col gap-1 text-xs text-ink-700">
                            {reasons.map((reason) => (
                              <li key={reason} className="flex gap-2">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                                    reason === "capacity_conflict" ? "bg-danger" : "bg-warning-fg",
                                  )}
                                />
                                {CONFLICT_LABEL[reason]}
                              </li>
                            ))}
                          </ul>
                        </Cell>
                        <Cell className="whitespace-nowrap text-right">
                          <Link
                            href={`/underwriting/contracts/${contract.id}`}
                            className="text-xs font-semibold text-brand-link"
                          >
                            Open contract →
                          </Link>
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            )}
          </section>

          <section aria-labelledby="exceptions-heading">
            <SectionHeading
              id="exceptions-heading"
              count={unresolvedExceptions.length}
              countVariant="warning"
              hint="Credits a host recorded as missed or moved, awaiting resolution"
              viewAll={
                unresolvedExceptions.length > EXCEPTIONS_SHOWN
                  ? {
                      href: "/underwriting/exceptions",
                      label: `See all ${unresolvedExceptions.length}`,
                    }
                  : undefined
              }
            >
              Open exceptions
            </SectionHeading>
            {unresolvedExceptions.length === 0 ? (
              <EmptyState>Nothing awaiting resolution.</EmptyState>
            ) : (
              <TableFrame>
                <Table>
                  <thead>
                    <HeaderRow>
                      <Th>Underwriter · line</Th>
                      <Th>Scheduled</Th>
                      <Th>Outcome</Th>
                    </HeaderRow>
                  </thead>
                  <tbody>
                    {unresolvedExceptions.slice(0, EXCEPTIONS_SHOWN).map((exception) => (
                      <Row key={exception.id}>
                        <Cell className="min-w-[12rem]">
                          <Link
                            href={`/underwriting/exceptions/${exception.id}`}
                            className="font-semibold text-brand-link"
                          >
                            {exception.contract.underwriter.name}
                          </Link>
                          <div className="text-xs text-ink-500">
                            {exception.scheduleLine.label ||
                              describeScheduleLine(exception.scheduleLine)}
                          </div>
                        </Cell>
                        <Cell className="whitespace-nowrap text-ink-500">
                          {formatPlacementTime(exception.original_scheduled_at)}
                        </Cell>
                        <Cell>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="warning">
                              {exception.host_action.replace(/_/g, " ")}
                            </Badge>
                            {exception.makegood_approval === "pending" && (
                              <Badge variant="neutral">agency approval pending</Badge>
                            )}
                          </div>
                        </Cell>
                      </Row>
                    ))}
                  </tbody>
                </Table>
              </TableFrame>
            )}
          </section>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3 p-4">
            <div>
              <h2 className="text-sm font-semibold text-ink-900">Auto-fill scheduling</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Fills every active contract&apos;s open periods, makegoods first, generating the Log
                rundowns it needs.
              </p>
            </div>
            <form action={autoFillAllAction}>
              <Button type="submit" className="w-full">
                Auto-fill everything
              </Button>
            </form>
            <details className="text-xs text-ink-500">
              <summary className="cursor-pointer font-semibold text-brand-link">
                What it will and won&apos;t do
              </summary>
              <p className="mt-2 leading-relaxed">
                Spreads credits across eligible days. Never the same underwriter twice in a break,
                never next to the same industry, and never past a period&apos;s quantity or the
                order&apos;s own per-day cap — the database checks the same limits the planner does.
                Live and submitted rundowns are left alone.
              </p>
            </details>
          </Card>

          <section aria-labelledby="glance-heading">
            <SectionHeading id="glance-heading">At a glance</SectionHeading>
            <Card>
              <ul className="divide-y divide-line text-sm">
                {[
                  {
                    label: "Active contracts",
                    value: activeContracts,
                    href: "/underwriting/contracts?status=active",
                  },
                  {
                    label: "Draft contracts",
                    value: draftContracts,
                    href: "/underwriting/contracts?status=draft",
                  },
                  {
                    label: "Approved copy",
                    value: copyApproved,
                    href: "/underwriting/copy?status=approved",
                  },
                  {
                    label: "Copy awaiting approval",
                    value: copyPendingApproval,
                    href: "/underwriting/copy?status=draft",
                  },
                ].map((stat) => (
                  <li key={stat.label}>
                    <Link
                      href={stat.href}
                      className="flex items-center justify-between px-4 py-2.5 hover:bg-panel-50"
                    >
                      <span className="text-ink-500">{stat.label}</span>
                      <span className="font-bold tabular-nums text-ink-900">{stat.value}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          {contracts.length > 0 && (
            <section aria-labelledby="recent-heading">
              <SectionHeading
                id="recent-heading"
                viewAll={{ href: "/underwriting/contracts", label: "All contracts" }}
              >
                Recently added
              </SectionHeading>
              <Card>
                <ul className="divide-y divide-line">
                  {contracts.slice(0, 5).map((contract) => (
                    <li key={contract.id}>
                      <Link
                        href={`/underwriting/contracts/${contract.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-panel-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-semibold text-brand-link">
                            {contract.underwriter.name}
                          </span>
                          <span className="block truncate text-xs text-ink-400">
                            {orderNumberLabel(contract.contract_identifier)}
                          </span>
                        </span>
                        <Badge variant={CONTRACT_STATUS_VARIANT[contract.status]}>
                          {contract.status}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function SectionHeading({
  id,
  children,
  count,
  countVariant = "neutral",
  hint,
  viewAll,
}: {
  id: string;
  children: ReactNode;
  count?: number;
  countVariant?: BadgeVariant;
  hint?: string;
  viewAll?: { href: string; label: string };
}) {
  return (
    <div className="mb-2 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
      <div>
        <div className="flex items-center gap-2">
          <h2 id={id} className="text-xs font-bold uppercase tracking-wide text-ink-400">
            {children}
          </h2>
          {count != null && count > 0 && <Badge variant={countVariant}>{count}</Badge>}
        </div>
        {hint && <p className="mt-0.5 text-xs text-ink-400">{hint}</p>}
      </div>
      {viewAll && (
        <Link href={viewAll.href} className="text-xs font-semibold text-brand-link">
          {viewAll.label} →
        </Link>
      )}
    </div>
  );
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded border border-dashed border-line px-4 py-5 text-sm text-ink-500">
      {children}
    </div>
  );
}
