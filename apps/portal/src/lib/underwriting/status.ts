import { defineStatusMap } from "@/components/ui/status-badge";
import type {
  UwAffidavitStatus,
  UwContractStatus,
  UwCopyApprovalStatus,
  UwRevisionStatus,
} from "@/lib/database.types";
import { EXCEPTION_FILTER_LABEL, type ExceptionStep } from "./exception-filters";
import type { MakegoodDisplayState } from "./makegoods";

// Status -> badge, defined once. Labels are the stored values on purpose: the
// screens have always shown the raw status word.

export const CONTRACT_STATUS = defineStatusMap<UwContractStatus>({
  draft: { label: "draft", variant: "neutral" },
  active: { label: "active", variant: "success" },
  expired: { label: "expired", variant: "muted" },
  terminated: { label: "terminated", variant: "danger" },
});

export const COPY_APPROVAL_STATUS = defineStatusMap<UwCopyApprovalStatus>({
  draft: { label: "draft", variant: "neutral" },
  approved: { label: "approved", variant: "success" },
  expired: { label: "expired", variant: "muted" },
  retired: { label: "retired", variant: "muted" },
});

export const REVISION_STATUS = defineStatusMap<UwRevisionStatus>({
  draft: { label: "draft", variant: "warning" },
  current: { label: "current", variant: "success" },
  superseded: { label: "superseded", variant: "muted" },
  cancelled: { label: "cancelled", variant: "muted" },
});

export const AFFIDAVIT_STATUS = defineStatusMap<UwAffidavitStatus>({
  draft: { label: "draft", variant: "neutral" },
  certified: { label: "certified", variant: "success" },
});

export const MAKEGOOD_STATUS = defineStatusMap<MakegoodDisplayState>({
  awaiting_slot: { label: "Awaiting a break", variant: "warning" },
  slot_scheduled: { label: "Scheduled", variant: "accent" },
  aired: { label: "Aired", variant: "success" },
  cancelled: { label: "Cancelled", variant: "muted" },
});

export const EXCEPTION_STEP_STATUS = defineStatusMap<ExceptionStep>({
  decision: { label: "Needs a decision", variant: "warning" },
  agency: { label: EXCEPTION_FILTER_LABEL.agency, variant: "accent" },
  awaiting_break: { label: EXCEPTION_FILTER_LABEL.awaiting_break, variant: "warning" },
  makegood_scheduled: { label: EXCEPTION_FILTER_LABEL.makegood_scheduled, variant: "accent" },
  resolved: { label: EXCEPTION_FILTER_LABEL.resolved, variant: "success" },
});
