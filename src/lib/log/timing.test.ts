import { describe, expect, it } from "vitest";
import {
  computeBreakFit,
  computeBreakStatus,
  computeRundownSummary,
  type RundownSummaryBreakLike,
} from "./timing";

describe("computeBreakFit", () => {
  it("reports a comfortable fit", () => {
    const fit = computeBreakFit(60, 30);
    expect(fit).toMatchObject({ remainingSeconds: 30, overSeconds: 0, fits: true });
  });

  it("reports an exact fit as fitting, with zero remaining", () => {
    const fit = computeBreakFit(30, 30);
    expect(fit).toMatchObject({ remainingSeconds: 0, overSeconds: 0, fits: true });
  });

  it("reports overage when placed items run longer than the available time", () => {
    const fit = computeBreakFit(30, 45);
    expect(fit).toMatchObject({ remainingSeconds: -15, overSeconds: 15, fits: false });
  });

  it("treats zero occupied duration as a fully empty break", () => {
    const fit = computeBreakFit(60, 0);
    expect(fit).toMatchObject({ occupiedDurationSeconds: 0, remainingSeconds: 60, fits: true });
  });
});

describe("computeBreakStatus", () => {
  it("an empty optional break is carrying_network — never a problem", () => {
    const status = computeBreakStatus({
      requirement: "optional",
      item_count: 0,
      fit: computeBreakFit(90, 0),
    });
    expect(status).toBe("carrying_network");
  });

  it("an empty required break is unresolved_required", () => {
    const status = computeBreakStatus({
      requirement: "required",
      item_count: 0,
      fit: computeBreakFit(90, 0),
    });
    expect(status).toBe("unresolved_required");
  });

  it("a filled break (optional or required) is filled", () => {
    expect(
      computeBreakStatus({ requirement: "optional", item_count: 1, fit: computeBreakFit(90, 30) }),
    ).toBe("filled");
    expect(
      computeBreakStatus({ requirement: "required", item_count: 1, fit: computeBreakFit(90, 30) }),
    ).toBe("filled");
  });

  it("an overfull break is over, regardless of requirement", () => {
    expect(
      computeBreakStatus({ requirement: "optional", item_count: 1, fit: computeBreakFit(30, 45) }),
    ).toBe("over");
  });
});

function summaryBreak(overrides: Partial<RundownSummaryBreakLike> = {}): RundownSummaryBreakLike {
  return {
    requirement: "required",
    available_duration_seconds: 30,
    occupied_duration_seconds: 30,
    item_count: 1,
    ...overrides,
  };
}

describe("computeRundownSummary", () => {
  it("is ready when every required break is filled and nothing runs over", () => {
    const summary = computeRundownSummary([
      summaryBreak(),
      summaryBreak({ requirement: "optional", occupied_duration_seconds: 0, item_count: 0 }),
    ]);
    expect(summary).toMatchObject({
      totalBreaks: 2,
      filledBreaks: 1,
      carryingNetworkBreaks: 1,
      unresolvedRequiredBreaks: 0,
      overCount: 0,
      ready: true,
    });
  });

  it("counts an empty required break as unresolved and is not ready", () => {
    const summary = computeRundownSummary([
      summaryBreak({ occupied_duration_seconds: 0, item_count: 0 }),
    ]);
    expect(summary.unresolvedRequiredBreaks).toBe(1);
    expect(summary.ready).toBe(false);
  });

  it("does not count an empty optional break as unresolved", () => {
    const summary = computeRundownSummary([
      summaryBreak({ requirement: "optional", occupied_duration_seconds: 0, item_count: 0 }),
    ]);
    expect(summary.unresolvedRequiredBreaks).toBe(0);
    expect(summary.carryingNetworkBreaks).toBe(1);
    expect(summary.ready).toBe(true);
  });

  it("counts and sums overage across breaks, and is not ready", () => {
    const summary = computeRundownSummary([
      summaryBreak({ available_duration_seconds: 30, occupied_duration_seconds: 45 }),
      summaryBreak({ available_duration_seconds: 40, occupied_duration_seconds: 50 }),
      summaryBreak({ available_duration_seconds: 30, occupied_duration_seconds: 20 }),
    ]);
    expect(summary.overCount).toBe(2);
    expect(summary.totalOverSeconds).toBe(25);
    expect(summary.ready).toBe(false);
  });
});
