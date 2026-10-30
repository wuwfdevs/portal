// Status -> {label, variant} maps for Editorial Planning's badges, defined once
// next to the domain and rendered with StatusBadge (components/ui/status-badge).

import { defineStatusMap } from "@/components/ui/status-badge";
import type { EpDecisionOutcome, EpMeetingStatus, EpPitchStatus } from "@/lib/database.types";

export const PITCH_STATUS = defineStatusMap<EpPitchStatus>({
  open: { label: "Open", variant: "neutral" },
  assigned: { label: "Assigned", variant: "accent" },
  archived: { label: "Archived", variant: "muted" },
});

export const MEETING_STATUS = defineStatusMap<EpMeetingStatus>({
  open: { label: "Scoring open", variant: "accent" },
  agenda: { label: "Agenda", variant: "neutral" },
  concluded: { label: "Concluded", variant: "muted" },
});

export const DECISION_OUTCOME = defineStatusMap<EpDecisionOutcome>({
  assigned: { label: "Assigned", variant: "accent" },
  deferred: { label: "Deferred", variant: "neutral" },
  archived: { label: "Archived", variant: "muted" },
});
