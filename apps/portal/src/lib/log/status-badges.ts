// Status -> {label, variant} maps for On Air's badges, rendered with
// <StatusBadge map={...} value={...} />. One place each, so a rundown's status
// reads the same on Today and on the rundown screen.

import { defineStatusMap } from "@/components/ui/status-badge";
import { DATA_SOURCE_STATE_LABELS, type DataSourceState } from "@/lib/log/data-sources";
import { STATUS_LABEL, type ProgramScheduleStatus } from "@/lib/log/program-status";
import type { LogApprovalStatus, LogRundownStatus } from "@/lib/database.types";

export const RUNDOWN_STATUS = defineStatusMap<LogRundownStatus>({
  draft: { label: "draft", variant: "neutral" },
  generated: { label: "generated", variant: "accent" },
  in_progress: { label: "in progress", variant: "warning" },
  submitted: { label: "submitted", variant: "success" },
});

export const APPROVAL_STATUS = defineStatusMap<LogApprovalStatus>({
  draft: { label: "draft", variant: "neutral" },
  approved: { label: "approved", variant: "success" },
  retired: { label: "retired", variant: "muted" },
});

export const PROGRAM_SCHEDULE_STATUS = defineStatusMap<ProgramScheduleStatus>({
  on_real_clock: { label: STATUS_LABEL.on_real_clock, variant: "success" },
  needs_clock: { label: STATUS_LABEL.needs_clock, variant: "warning" },
  not_scheduled: { label: STATUS_LABEL.not_scheduled, variant: "neutral" },
});

export const DATA_SOURCE_STATE = defineStatusMap<DataSourceState>({
  fresh: { label: DATA_SOURCE_STATE_LABELS.fresh, variant: "success" },
  stale: { label: DATA_SOURCE_STATE_LABELS.stale, variant: "warning" },
  never_fetched: { label: DATA_SOURCE_STATE_LABELS.never_fetched, variant: "muted" },
  not_configured: { label: DATA_SOURCE_STATE_LABELS.not_configured, variant: "neutral" },
});
