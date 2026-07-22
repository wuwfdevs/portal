import { Badge } from "@/components/ui/badge";
import type { EpDecisionOutcome, EpMeetingStatus, EpPitchStatus } from "@/lib/database.types";

export function PitchStatusBadge({ status }: { status: EpPitchStatus }) {
  if (status === "assigned") return <Badge variant="accent">Assigned</Badge>;
  if (status === "archived") return <Badge variant="muted">Archived</Badge>;
  return <Badge variant="neutral">Open</Badge>;
}

export function MeetingStatusBadge({ status }: { status: EpMeetingStatus }) {
  if (status === "open") return <Badge variant="accent">Scoring open</Badge>;
  if (status === "agenda") return <Badge variant="neutral">Agenda</Badge>;
  return <Badge variant="muted">Concluded</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: EpDecisionOutcome | null }) {
  if (outcome === "assigned") return <Badge variant="accent">Assigned</Badge>;
  if (outcome === "deferred") return <Badge variant="neutral">Deferred</Badge>;
  if (outcome === "archived") return <Badge variant="muted">Archived</Badge>;
  return <Badge variant="muted">Undecided</Badge>;
}
