// The exceptions list's status filter (docs/ui-patterns.md: filters are
// query-string chips). Pure so the dashboard's "Makegoods pending agency
// approval" figure counts exactly what its link to ?status=agency_pending
// shows.

import type { UwMakegoodApproval, UwResolutionStatus } from "@/lib/database.types";

export const EXCEPTION_FILTERS = ["all", "open", "agency_pending", "resolved"] as const;
export type ExceptionFilter = (typeof EXCEPTION_FILTERS)[number];

export function matchesExceptionFilter(
  exception: { resolution_status: UwResolutionStatus; makegood_approval: UwMakegoodApproval },
  filter: ExceptionFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return exception.resolution_status === "open";
    case "resolved":
      return exception.resolution_status === "resolved";
    case "agency_pending":
      return exception.makegood_approval === "pending";
  }
}
