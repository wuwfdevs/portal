import { describe, expect, it } from "vitest";
import {
  computeDepartmentCounts,
  computeDispositionCounts,
  computeStageCounts,
  computeTotals,
  computeTrackCounts,
  type DashboardSubmission,
} from "./dashboard";

function submission(overrides: Partial<DashboardSubmission> = {}): DashboardSubmission {
  return {
    stage: "new",
    disposition: null,
    partnership_types: ["classroom_visit"],
    department: "Communication",
    estimated_students_reached: 20,
    ...overrides,
  };
}

describe("computeTotals", () => {
  it("counts active vs total, and sums students reached separately for each", () => {
    const totals = computeTotals([
      submission({ estimated_students_reached: 30 }),
      submission({ disposition: "declined", estimated_students_reached: 50 }),
      submission({ stage: "completed", estimated_students_reached: 10 }),
    ]);
    expect(totals.total).toBe(3);
    expect(totals.active).toBe(2);
    expect(totals.completed).toBe(1);
    expect(totals.totalStudentsReached).toBe(90);
    expect(totals.activeStudentsReached).toBe(40);
  });

  it("treats a missing estimate as zero, not a skipped row", () => {
    const totals = computeTotals([submission({ estimated_students_reached: null })]);
    expect(totals.total).toBe(1);
    expect(totals.totalStudentsReached).toBe(0);
  });
});

describe("computeStageCounts", () => {
  it("counts every stage, including zero, and excludes dispositioned submissions", () => {
    const counts = computeStageCounts([
      submission({ stage: "new" }),
      submission({ stage: "new" }),
      submission({ stage: "active", disposition: "withdrawn" }),
    ]);
    const byStage = Object.fromEntries(counts.map((c) => [c.stage, c.count]));
    expect(byStage.new).toBe(2);
    expect(byStage.active).toBe(0);
    expect(byStage.completed).toBe(0);
  });
});

describe("computeDispositionCounts", () => {
  it("counts only dispositioned submissions, per disposition", () => {
    const counts = computeDispositionCounts([
      submission({ disposition: "declined" }),
      submission({ disposition: "declined" }),
      submission({ disposition: "deferred" }),
      submission(),
    ]);
    const byDisposition = Object.fromEntries(counts.map((c) => [c.disposition, c.count]));
    expect(byDisposition.declined).toBe(2);
    expect(byDisposition.deferred).toBe(1);
    expect(byDisposition.withdrawn).toBe(0);
  });
});

describe("computeTrackCounts", () => {
  it("counts a multi-track submission toward every track it named", () => {
    const counts = computeTrackCounts([
      submission({ partnership_types: ["classroom_visit", "applied_project"] }),
      submission({ partnership_types: ["classroom_visit"] }),
    ]);
    const byType = Object.fromEntries(counts.map((c) => [c.type, c.count]));
    expect(byType.classroom_visit).toBe(2);
    expect(byType.applied_project).toBe(1);
  });

  it("sorts descending by count", () => {
    const counts = computeTrackCounts([
      submission({ partnership_types: ["other"] }),
      submission({ partnership_types: ["classroom_visit"] }),
      submission({ partnership_types: ["classroom_visit"] }),
    ]);
    expect(counts[0]!.type).toBe("classroom_visit");
    expect(counts[0]!.count).toBe(2);
  });
});

describe("computeDepartmentCounts", () => {
  it("folds everything past the top N into Other", () => {
    const submissions = ["A", "A", "B", "C", "D", "E", "F", "G"].map((department) =>
      submission({ department }),
    );
    const counts = computeDepartmentCounts(submissions, 3);
    expect(counts).toHaveLength(4);
    expect(counts[0]).toEqual({ department: "A", count: 2 });
    const other = counts.find((c) => c.department === "Other");
    expect(other?.count).toBe(4); // D, E, F, G — everything past the top 3 (A, B, C)
  });

  it("returns every department when there are fewer than topN", () => {
    const counts = computeDepartmentCounts([submission({ department: "A" })], 6);
    expect(counts).toEqual([{ department: "A", count: 1 }]);
  });
});
