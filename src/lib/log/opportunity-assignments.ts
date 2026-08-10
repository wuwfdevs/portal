// Pure logic for log_opportunity_assignments — no Supabase import, colocated
// test. A producer pins a specific content-library item to a specific local
// opportunity so generation places it automatically (see
// planAssignedContentPlacements below), the same mechanism legal-ID
// auto-placement now runs on instead of a content-type-specific heuristic —
// see CLAUDE.md's dated note.
//
// Kept pure and dependency-free on purpose, not just for testability: it's
// called from two different RLS contexts — a Log-access session
// (rundown-actions.ts, via lib/log/opportunity-assignment-placement.ts's
// thin RLS-scoped wrapper) and an underwriting-only session
// (lib/underwriting/rundown-provisioning.ts, fed data read past RLS through
// log_get_program_schedule_context()) — and this is "one monolith," so both
// import the same planning logic directly rather than either duplicating it
// or reimplementing it in SQL. Only the read/write of the underlying tables
// crosses the RLS boundary; what to place never does.

import { computeTotalDurationSeconds, type ComponentDurationLike } from "@/lib/log/content-library";
import type { RundownBreakDraft } from "@/lib/log/rundown-generation";

export interface OpportunityAssignmentLike {
  id: string;
  local_opportunity_id: string;
  content_item_id: string;
  hour_index: number | null;
  days_of_week: number[];
  active: boolean;
}

export interface AssignmentTargetLike {
  local_opportunity_id: string;
  hour_index: number;
}

/**
 * The 0=Sunday..6=Saturday day of week for a plain calendar date (YYYY-MM-DD),
 * anchored at midnight UTC — matches lib/log/schedule.ts's
 * isScheduleEntryActiveOn exactly, since both read a bare calendar date
 * (log_rundowns.air_date), not an instant with a timezone of its own.
 */
export function dayOfWeekForDateISO(dateISO: string): number {
  return new Date(`${dateISO}T00:00:00Z`).getUTCDay();
}

/**
 * Which active assignments apply to one generated break — matched on the
 * opportunity it occupies, its hour-of-shift repetition (null on the
 * assignment means every hour), and the air date's day of week (empty
 * days_of_week means every day, same convention log_schedule.days_of_week
 * uses). More than one assignment can legitimately match the same break
 * (e.g. two overlapping day-of-week rules) — placement itself is
 * responsible for not placing the same content item twice.
 */
export function selectApplicableAssignments(
  assignments: OpportunityAssignmentLike[],
  target: AssignmentTargetLike,
  dayOfWeek: number,
): OpportunityAssignmentLike[] {
  return assignments.filter(
    (assignment) =>
      assignment.active &&
      assignment.local_opportunity_id === target.local_opportunity_id &&
      (assignment.hour_index === null || assignment.hour_index === target.hour_index) &&
      (assignment.days_of_week.length === 0 || assignment.days_of_week.includes(dayOfWeek)),
  );
}

export interface InsertedBreakLike {
  id: string;
  local_opportunity_id: string;
  scheduled_at: string;
}

export interface ContentItemForPlacement {
  expected_duration_seconds: number | null;
  components: ComponentDurationLike[];
}

export interface PlannedRundownItem {
  break_id: string;
  position: number;
  item_kind: "content";
  content_item_id: string;
  planned_duration_seconds: number;
  placement_status: "replaceable";
}

/**
 * Turns a freshly-generated set of breaks into the log_rundown_items rows
 * assigned content should insert into them — the shared planning step both
 * placement paths call (see this file's own header). Silently skips a break
 * with no draft match, an assignment whose content item wasn't supplied
 * (deactivated/deleted since the assignment was made), or a computed
 * duration of zero — none of those are errors, just "nothing to place
 * here," the same as an unused optional opportunity being a normal,
 * resolved state.
 */
export function planAssignedContentPlacements(
  insertedBreaks: InsertedBreakLike[],
  drafts: RundownBreakDraft[],
  assignments: OpportunityAssignmentLike[],
  contentItems: Map<string, ContentItemForPlacement>,
  airDateISO: string,
): PlannedRundownItem[] {
  if (insertedBreaks.length === 0 || assignments.length === 0) return [];

  const draftByKey = new Map(
    drafts.map((draft) => [`${draft.local_opportunity_id}|${draft.scheduled_at}`, draft]),
  );
  const dayOfWeek = dayOfWeekForDateISO(airDateISO);
  const rows: PlannedRundownItem[] = [];

  for (const brk of insertedBreaks) {
    const draft = draftByKey.get(`${brk.local_opportunity_id}|${brk.scheduled_at}`);
    if (!draft) continue;

    const applicable = selectApplicableAssignments(
      assignments,
      { local_opportunity_id: brk.local_opportunity_id, hour_index: draft.hour_index },
      dayOfWeek,
    );
    if (applicable.length === 0) continue;

    // Deduped so two overlapping assignment rules never place the same
    // content item twice into the same break.
    const contentItemIds = [...new Set(applicable.map((assignment) => assignment.content_item_id))];
    let position = 1;
    for (const contentItemId of contentItemIds) {
      const item = contentItems.get(contentItemId);
      if (!item) continue;
      const plannedDurationSeconds = computeTotalDurationSeconds(item.components, item.expected_duration_seconds);
      if (!plannedDurationSeconds || plannedDurationSeconds <= 0) continue;
      rows.push({
        break_id: brk.id,
        position: position++,
        item_kind: "content",
        content_item_id: contentItemId,
        planned_duration_seconds: plannedDurationSeconds,
        placement_status: "replaceable",
      });
    }
  }

  return rows;
}
