// Pure aggregation for the KPI dashboard. No Supabase, no React — takes
// whatever listAllSubmissions() already returns and reduces it, so there is
// no second read path or SQL aggregate function to keep in sync with the
// schema. Fine for a tool at this scale; revisit with a real SQL aggregate
// if submission volume ever makes an in-app reduce too slow.

import { STAGES } from "./pipeline";
import { PARTNERSHIP_TYPES } from "./partnership-types";
import type { ApDisposition, ApPartnershipType, ApStage } from "@/lib/database.types";

export interface DashboardSubmission {
  stage: ApStage;
  disposition: ApDisposition | null;
  partnership_types: ApPartnershipType[];
  department: string;
  estimated_students_reached: number | null;
}

export interface DashboardTotals {
  total: number;
  active: number;
  completed: number;
  totalStudentsReached: number;
  activeStudentsReached: number;
}

/** Headline stat-tile numbers. "Active" = still in the pipeline (no disposition yet). */
export function computeTotals(submissions: DashboardSubmission[]): DashboardTotals {
  let active = 0;
  let completed = 0;
  let totalStudentsReached = 0;
  let activeStudentsReached = 0;

  for (const submission of submissions) {
    const reached = submission.estimated_students_reached ?? 0;
    totalStudentsReached += reached;
    if (submission.disposition === null) {
      active += 1;
      activeStudentsReached += reached;
      if (submission.stage === "completed") completed += 1;
    }
  }

  return { total: submissions.length, active, completed, totalStudentsReached, activeStudentsReached };
}

/** One count per pipeline stage, active submissions only — mirrors the kanban board's own filter. */
export function computeStageCounts(submissions: DashboardSubmission[]): { stage: ApStage; count: number }[] {
  const counts = new Map<ApStage, number>(STAGES.map((stage) => [stage, 0]));
  for (const submission of submissions) {
    if (submission.disposition === null) {
      counts.set(submission.stage, (counts.get(submission.stage) ?? 0) + 1);
    }
  }
  return STAGES.map((stage) => ({ stage, count: counts.get(stage) ?? 0 }));
}

/** One count per disposition — how submissions left the active pipeline, and how many. */
export function computeDispositionCounts(
  submissions: DashboardSubmission[],
): { disposition: ApDisposition; count: number }[] {
  const dispositions: ApDisposition[] = ["deferred", "declined", "withdrawn", "archived"];
  const counts = new Map<ApDisposition, number>(dispositions.map((d) => [d, 0]));
  for (const submission of submissions) {
    if (submission.disposition !== null) {
      counts.set(submission.disposition, (counts.get(submission.disposition) ?? 0) + 1);
    }
  }
  return dispositions.map((disposition) => ({ disposition, count: counts.get(disposition) ?? 0 }));
}

/**
 * One count per track. A submission naming two tracks counts toward both, so
 * this total can exceed the submission count — it's instances, not
 * submissions, and the dashboard labels it that way.
 */
export function computeTrackCounts(
  submissions: DashboardSubmission[],
): { type: ApPartnershipType; count: number }[] {
  const counts = new Map<ApPartnershipType, number>(PARTNERSHIP_TYPES.map((type) => [type, 0]));
  for (const submission of submissions) {
    for (const type of submission.partnership_types) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  return PARTNERSHIP_TYPES.map((type) => ({ type, count: counts.get(type) ?? 0 })).sort(
    (a, b) => b.count - a.count,
  );
}

/** Top N departments by submission count; everything past that folds into "Other" rather than a long tail. */
export function computeDepartmentCounts(
  submissions: DashboardSubmission[],
  topN = 6,
): { department: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const submission of submissions) {
    counts.set(submission.department, (counts.get(submission.department) ?? 0) + 1);
  }
  const sorted = Array.from(counts.entries())
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => b.count - a.count);

  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN);
  const otherCount = sorted.slice(topN).reduce((sum, row) => sum + row.count, 0);
  return [...top, { department: "Other", count: otherCount }];
}
