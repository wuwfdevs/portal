import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listExceptions } from "@/lib/underwriting/queries";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import { describeScheduleLine } from "@/lib/underwriting/demand";
import type { UwResolutionStatus } from "@/lib/database.types";
import {
  EXCEPTION_FILTERS,
  matchesExceptionFilter,
  type ExceptionFilter,
} from "@/lib/underwriting/exception-filters";

const STATUS_VARIANT: Record<UwResolutionStatus, BadgeVariant> = {
  open: "warning",
  resolved: "success",
};

/**
 * Workflow E (docs/underwriting-design.md §3E): every underwriting-kind
 * broadcast event whose outcome wasn't aired_as_scheduled, auto-created by
 * uw_flag_exception_from_broadcast_event() the moment a host records it —
 * there's no "check for new exceptions" step, they're just here.
 */
export default async function ExceptionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q, status } = await searchParams;
  const filter: ExceptionFilter = (EXCEPTION_FILTERS as readonly string[]).includes(status ?? "")
    ? (status as ExceptionFilter)
    : "all";
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
  const count = (next: ExceptionFilter) =>
    matching.filter((exception) => matchesExceptionFilter(exception, next)).length;
  const shown = matching.filter((exception) => matchesExceptionFilter(exception, filter));
  const hrefFor = (next: ExceptionFilter) =>
    `/underwriting/exceptions?${new URLSearchParams({
      ...(query ? { q: q ?? "" } : {}),
      ...(next !== "all" ? { status: next } : {}),
    }).toString()}`.replace(/\?$/, "");
  const chip = (label: string, next: ExceptionFilter) => ({
    label,
    count: count(next),
    href: hrefFor(next),
    active: filter === next,
  });

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={{
          placeholder: "Search underwriter or line",
          label: "Search exceptions",
          defaultValue: q,
          hidden: filter !== "all" ? { status: filter } : undefined,
        }}
        chipsLabel="Filter by status"
        chips={[
          chip("All", "all"),
          chip("Open", "open"),
          chip("Agency approval pending", "agency_pending"),
          chip("Resolved", "resolved"),
        ]}
      />

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
                <Th>Schedule line</Th>
                <Th>Scheduled</Th>
                <Th>Outcome</Th>
                <Th>Status</Th>
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
                  </Cell>
                  <Cell label="Line" className="text-ink-500">
                    {exception.scheduleLine.label || describeScheduleLine(exception.scheduleLine)}
                  </Cell>
                  <Cell label="Scheduled" className="whitespace-nowrap text-ink-500">
                    {formatPlacementTime(exception.original_scheduled_at)}
                  </Cell>
                  <Cell label="Outcome" className="text-ink-700">
                    {exception.host_action.replace(/_/g, " ")}
                    {exception.host_reason ? ` (${exception.host_reason.replace(/_/g, " ")})` : ""}
                  </Cell>
                  <Cell stack="aside">
                    <div className="flex flex-wrap justify-end gap-1.5 md:justify-start">
                      <Badge variant={STATUS_VARIANT[exception.resolution_status]}>
                        {exception.resolution_status}
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
    </div>
  );
}
