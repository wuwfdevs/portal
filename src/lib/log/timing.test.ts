import { describe, expect, it } from "vitest";
import { computeRundownSummary, computeSlotFit, type RundownSummaryItemLike } from "./timing";

describe("computeSlotFit", () => {
  it("reports a comfortable fit", () => {
    const fit = computeSlotFit(60, 30);
    expect(fit).toMatchObject({ remainingSeconds: 30, overSeconds: 0, fits: true });
  });

  it("reports an exact fit as fitting, with zero remaining", () => {
    const fit = computeSlotFit(30, 30);
    expect(fit).toMatchObject({ remainingSeconds: 0, overSeconds: 0, fits: true });
  });

  it("reports overage when planned material runs longer than the slot", () => {
    const fit = computeSlotFit(30, 45);
    expect(fit).toMatchObject({ remainingSeconds: -15, overSeconds: 15, fits: false });
  });

  it("treats a null planned duration as zero (an empty slot)", () => {
    const fit = computeSlotFit(60, null);
    expect(fit).toMatchObject({ plannedDurationSeconds: 0, remainingSeconds: 60, fits: true });
  });
});

function summaryItem(overrides: Partial<RundownSummaryItemLike> = {}): RundownSummaryItemLike {
  return {
    content_item_id: "content-1",
    requirement_level: "required",
    planned_duration_seconds: 30,
    slot_duration_seconds: 30,
    ...overrides,
  };
}

describe("computeRundownSummary", () => {
  it("is ready when every required slot is filled and nothing runs over", () => {
    const summary = computeRundownSummary([summaryItem(), summaryItem({ requirement_level: "optional" })]);
    expect(summary).toMatchObject({ totalItems: 2, filledItems: 2, emptyRequiredItems: 0, overCount: 0, ready: true });
  });

  it("counts an empty required slot and is not ready", () => {
    const summary = computeRundownSummary([summaryItem({ content_item_id: null })]);
    expect(summary.emptyRequiredItems).toBe(1);
    expect(summary.ready).toBe(false);
  });

  it("does not count an empty optional slot as unready", () => {
    const summary = computeRundownSummary([
      summaryItem({ content_item_id: null, requirement_level: "optional" }),
    ]);
    expect(summary.emptyRequiredItems).toBe(0);
    expect(summary.ready).toBe(true);
  });

  it("counts and sums overage across items, and is not ready", () => {
    const summary = computeRundownSummary([
      summaryItem({ planned_duration_seconds: 45, slot_duration_seconds: 30 }),
      summaryItem({ planned_duration_seconds: 50, slot_duration_seconds: 40 }),
      summaryItem({ planned_duration_seconds: 20, slot_duration_seconds: 30 }),
    ]);
    expect(summary.overCount).toBe(2);
    expect(summary.totalOverSeconds).toBe(25);
    expect(summary.ready).toBe(false);
  });
});
