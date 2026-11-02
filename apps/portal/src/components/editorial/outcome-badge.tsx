import { Badge } from "@/components/ui/badge";
import { StatusBadge } from "@/components/ui/status-badge";
import { DECISION_OUTCOME, MEETING_STATUS, PITCH_STATUS } from "@/lib/editorial/status";
import type { EpDecisionOutcome, EpMeetingStatus, EpPitchStatus } from "@/lib/database.types";

export function PitchStatusBadge({ status }: { status: EpPitchStatus }) {
  return <StatusBadge map={PITCH_STATUS} value={status} />;
}

export function MeetingStatusBadge({ status }: { status: EpMeetingStatus }) {
  return <StatusBadge map={MEETING_STATUS} value={status} />;
}

export function OutcomeBadge({ outcome }: { outcome: EpDecisionOutcome | null }) {
  if (outcome === null) return <Badge variant="muted">Undecided</Badge>;
  return <StatusBadge map={DECISION_OUTCOME} value={outcome} />;
}
