import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { FilterMenu } from "@/components/ui/filter-menu";
import { ListSearch } from "@/components/ui/list-search";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listExceptions, type ExceptionListItem } from "@/lib/underwriting/queries";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import { describeScheduleLine } from "@/lib/underwriting/demand";
import { orderNumberLabel } from "@/lib/underwriting/contract-label";
import {
  countByExceptionFilter,
  defaultExceptionFilter,
  EXCEPTION_FILTER_LABEL,
  EXCEPTION_FILTERS,
  exceptionStep,
  matchesExceptionFilter,
  OPEN_EXCEPTION_STEPS,
  RESOLUTION_ACTION_LABEL,
  type ExceptionFilter,
} from "@/lib/underwriting/exception-filters";
import { describeMakegoodState } from "@/lib/underwriting/makegoods";
import { shortDate } from "@/lib/underwriting/dates";
import { stationTodayISO } from "@/lib/log/timezone";

/**
 * Workflow E with makegoods folded in (docs/underwriting-traffic-redesign.md
 * §17): one row per missed credit, its makegood alongside, filtered by the
 * step it's at. Exceptions are created by uw_flag_exception_from_broadcast_event()
 * the moment a host records a miss, and close themselves when their last
 * makegood airs — there's no "check for new exceptions" or "close" step.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const query = (q ?? "").trim().toLowerCase();
  const exceptions = await listExceptions();

  if (exceptions.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No exceptions — every underwriting credit has aired as scheduled so far.
      </div>
    );
  }

  const matching = exceptions.filter(
    (exception) =>
      query === "" ||
      exception.contract.underwriter.name.toLowerCase().includes(query) ||
      (exception.scheduleLine.label ?? "").toLowerCase().includes(query),
  );
  const filter: ExceptionFilter = (EXCEPTION_FILTERS as readonly string[]).includes(status ?? "")
    ? (status as ExceptionFilter)
    : defaultExceptionFilter(matching);
  const counts = countByExceptionFilter(matching);
  const shown = matching.filter((exception) => matchesExceptionFilter(exception, filter));
  const hrefFor = (next: ExceptionFilter) =>
    `/underwriting/exceptions?${new URLSearchParams({
      ...(query ? { q: q ?? "" } : {}),
      status: next,
    }).toString()}`;
  const chip = (next: ExceptionFilter) => ({
    label: EXCEPTION_FILTER_LABEL[next],
    count: counts[next],
    href: hrefFor(next),
    active: filter === next,
  });

  return (
    <div className="flex flex-col gap-4">
      {/* The steps read in order, then the closed and everything views, set
          apart. Inline from sm up — more chips than ListToolbar's inline
          limit, but they're one ordered sequence, not separate dimensions —
          and behind the Filter button on a phone, like every other list. */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <ListSearch
          placeholder="Search underwriter or line"
          label="Search exceptions"
          defaultValue={q}
          hidden={status ? { status: filter } : undefined}
          className="w-full max-sm:order-first sm:w-72"
        />
        <div className="hidden flex-wrap items-center gap-1.5 sm:flex">
          <FilterChips label="Filter by step" chips={OPEN_EXCEPTION_STEPS.map(chip)} />
          <span aria-hidden="true" className="mx-1 h-6 w-px bg-line" />
          <FilterChips label="Closed and all" chips={[chip("resolved"), chip("all")]} />
        </div>
        <FilterMenu
          className="sm:hidden"
          groups={[
            {
              label: "Step",
              chips: [chip("all"), ...OPEN_EXCEPTION_STEPS.map(chip), chip("resolved")],
            },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
          No exceptions match.
        </div>
      ) : (
        <TableFrame>
          <Table stack>
            <thead>
              <HeaderRow>
                <Th>Underwriter</Th>
                <Th>Line</Th>
                <Th>Missed</Th>
                <Th>What the host recorded</Th>
                <Th>Makegood</Th>
                <Th>Next step</Th>
              </HeaderRow>
            </thead>
            <tbody>
              {shown.map((exception) => (
                <Row key={exception.id}>
                  <Cell stack="title" className="font-semibold text-ink-900">
                    <Link
                      href={`/underwriting/exceptions/${exception.id}`}
                      className="text-brand-link"
                    >
                      {exception.contract.underwriter.name}
                    </Link>
                    <div className="text-xs font-normal text-ink-400">
                      {orderNumberLabel(exception.contract.contract_identifier)}
                    </div>
                  </Cell>
                  <Cell label="Line" className="text-ink-500">
                    {exception.scheduleLine.label || describeScheduleLine(exception.scheduleLine)}
                  </Cell>
                  <Cell label="Missed" className="whitespace-nowrap text-ink-500">
                    {formatPlacementTime(exception.original_scheduled_at)}
                  </Cell>
                  <Cell label="Recorded" className="text-ink-700">
                    {hostOutcome(exception)}
                  </Cell>
                  <Cell stack="aside">
                    <MakegoodBadge exception={exception} />
                  </Cell>
                  <Cell label="Next step" className="text-ink-700">
                    <NextStep exception={exception} />
                  </Cell>
                </Row>
              ))}
            </tbody>
          </Table>
        </TableFrame>
      )}
    </div>
  );
}

function hostOutcome(exception: ExceptionListItem): string {
  const action = exception.host_action.replace(/_/g, " ");
  const reason = exception.host_reason?.replace(/_/g, " ");
  const text = reason ? `${action} · ${reason}` : action;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const MAKEGOOD_VARIANT: Record<ReturnType<typeof describeMakegoodState>, BadgeVariant> = {
  awaiting_slot: "warning",
  slot_scheduled: "accent",
  aired: "success",
  cancelled: "muted",
};

/** The makegood that says the most: one still in play, else the newest. */
function MakegoodBadge({ exception }: { exception: ExceptionListItem }) {
  if (exception.resolution_status === "open" && exception.makegood_approval === "pending") {
    return <Badge variant="accent">Agency asked</Badge>;
  }
  const makegood =
    exception.makegoods.find((item) => item.status === "scheduled") ?? exception.makegoods[0];
  if (!makegood) {
    return exception.resolution_action === "waive" ? (
      <Badge variant="muted">Waived</Badge>
    ) : (
      <Badge variant="muted">None yet</Badge>
    );
  }
  const state = describeMakegoodState(makegood);
  const label =
    state === "awaiting_slot"
      ? "Awaiting a break"
      : state === "slot_scheduled"
        ? makegood.scheduled_for
          ? formatPlacementTime(makegood.scheduled_for)
          : "Scheduled"
        : state === "aired"
          ? "Aired"
          : "Cancelled";
  const more = exception.makegoods.length > 1 ? ` +${exception.makegoods.length - 1}` : "";
  return (
    <Badge variant={MAKEGOOD_VARIANT[state]}>
      {label}
      {more}
    </Badge>
  );
}

function NextStep({ exception }: { exception: ExceptionListItem }) {
  const href = `/underwriting/exceptions/${exception.id}`;
  switch (exceptionStep(exception)) {
    case "decision":
      return (
        <>
          <Link href={`${href}#resolve`} className="font-bold text-brand-link">
            Decide
          </Link>
          <span className="text-ink-500"> · makegood, alternate airing, or waive</span>
        </>
      );
    case "agency":
      return (
        <Link href={`${href}#agency`} className="font-semibold text-brand-link">
          Record the agency&apos;s answer
        </Link>
      );
    case "awaiting_break":
      return (
        <span className="text-ink-500">
          Auto-fill will place it ·{" "}
          <Link href={`${href}#makegood`} className="font-semibold text-brand-link">
            Pick a break
          </Link>
        </span>
      );
    case "makegood_scheduled":
      return <span className="text-ink-500">Closes itself when it airs</span>;
    case "resolved":
      return (
        <span className="text-ink-500">
          Resolved
          {exception.resolved_at ? ` ${shortDate(stationTodayISO(exception.resolved_at))}` : ""}
          {exception.resolution_action
            ? ` · ${RESOLUTION_ACTION_LABEL[exception.resolution_action]}`
            : ""}
        </span>
      );
  }
}
