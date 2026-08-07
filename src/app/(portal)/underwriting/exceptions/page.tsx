import Link from "next/link";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Cell, HeaderRow, Row, Table, TableFrame, Th } from "@/components/ui/table";
import { listExceptions } from "@/lib/underwriting/queries";
import { formatPlacementTime } from "@/lib/underwriting/placement";
import type { UwResolutionStatus } from "@/lib/database.types";

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
export default async function ExceptionsPage() {
  const exceptions = await listExceptions();

  if (exceptions.length === 0) {
    return (
      <div className="max-w-md rounded border border-dashed border-line p-6 text-sm text-ink-500">
        No exceptions — every underwriting credit has aired as scheduled so far.
      </div>
    );
  }

  return (
    <TableFrame>
      <Table>
        <thead>
          <HeaderRow>
            <Th>Underwriter</Th>
            <Th>Obligation</Th>
            <Th>Scheduled</Th>
            <Th>Outcome</Th>
            <Th>Status</Th>
          </HeaderRow>
        </thead>
        <tbody>
          {exceptions.map((exception) => (
            <Row key={exception.id}>
              <Cell className="font-semibold text-ink-900">
                <Link href={`/underwriting/exceptions/${exception.id}`} className="text-brand-link">
                  {exception.contract.underwriter_name}
                </Link>
              </Cell>
              <Cell className="text-ink-500">{exception.obligation.description}</Cell>
              <Cell className="whitespace-nowrap text-ink-500">
                {formatPlacementTime(exception.original_scheduled_at)}
              </Cell>
              <Cell className="text-ink-700">
                {exception.host_action.replace(/_/g, " ")}
                {exception.host_reason ? ` (${exception.host_reason.replace(/_/g, " ")})` : ""}
              </Cell>
              <Cell>
                <Badge variant={STATUS_VARIANT[exception.resolution_status]}>{exception.resolution_status}</Badge>
              </Cell>
            </Row>
          ))}
        </tbody>
      </Table>
    </TableFrame>
  );
}
