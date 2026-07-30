// Post-selection story planning: a small, pure lifecycle model plus the
// label maps the screens render from. See design §5A — this stays narrowly
// scoped to the handoff from a selected pitch into planned reporting, not a
// production-tracking system.

import type { EpOtrStatus, EpStandardsFlag, EpStoryPlanStatus } from "@/lib/database.types";

export const STORY_PLAN_STATUSES: EpStoryPlanStatus[] = ["draft", "ready_for_editor", "approved"];

export const STORY_PLAN_STATUS_LABEL: Record<EpStoryPlanStatus, string> = {
  draft: "Draft",
  ready_for_editor: "Ready for editor",
  approved: "Approved",
};

export const OTR_STATUSES: EpOtrStatus[] = [
  "not_applicable",
  "not_yet_sought",
  "in_progress",
  "declined",
  "obtained",
];

export const OTR_STATUS_LABEL: Record<EpOtrStatus, string> = {
  not_applicable: "Not applicable",
  not_yet_sought: "Not yet sought",
  in_progress: "In progress",
  declined: "Declined by subject",
  obtained: "Obtained",
};

export const STANDARDS_FLAGS: EpStandardsFlag[] = [
  "ethics_harm",
  "editorial_independence",
  "verification",
  "framing",
];

export const STANDARDS_FLAG_LABEL: Record<EpStandardsFlag, string> = {
  ethics_harm: "Ethics / harm",
  editorial_independence: "Editorial independence or institutional pressure",
  verification: "Verification",
  framing: "Framing",
};

export type StoryPlanActor = "reporter" | "editor";

// Editors can move a plan between any two distinct states (including
// reopening an approved plan for revision). A reporter may only submit a
// draft for editor review or pull it back for more work — approval is an
// editor-only action by construction, mirroring the RLS policy that never
// lets a reporter write status = 'approved'.
const REPORTER_TRANSITIONS: Partial<Record<EpStoryPlanStatus, EpStoryPlanStatus[]>> = {
  draft: ["ready_for_editor"],
  ready_for_editor: ["draft"],
};

export function canTransitionStoryPlanStatus(
  from: EpStoryPlanStatus,
  to: EpStoryPlanStatus,
  actor: StoryPlanActor,
): boolean {
  if (from === to) return false;
  if (actor === "editor") return true;
  return REPORTER_TRANSITIONS[from]?.includes(to) ?? false;
}
