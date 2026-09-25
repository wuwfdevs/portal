import { describe, expect, it } from "vitest";
import { computeReadiness, countReady, type ReadinessInput } from "./readiness";

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
  return {
    contractIdentifier: "IO 2025-08 rev 3",
    effectiveFrom: "2025-08-11",
    effectiveTo: "2026-08-23",
    sponsorshipTotal: 30888,
    hasAgreement: true,
    lineCount: 3,
    expectedTotal: 702,
    statedTotalSpots: 702,
    copyLinked: 2,
    copyApproved: 2,
    separationUndecided: false,
    affidavitRequired: false,
    makegoodRequiresAgencyApproval: true,
    preemptionPolicy: "Rescheduled within the program originally sponsored",
    ...overrides,
  };
}

describe("computeReadiness", () => {
  it("reads a complete draft as five of five", () => {
    const items = computeReadiness(input());
    expect(items.map((item) => item.state)).toEqual(["ok", "ok", "ok", "ok", "ok"]);
    expect(countReady(items)).toEqual({ done: 5, total: 5 });
    expect(items[2]!.detail).toBe("Matches the 702 spots on the order.");
  });

  it("warns, never blocks, on unapproved copy, a stated-total mismatch, and an undecided separation rule", () => {
    const items = computeReadiness(
      input({ copyApproved: 1, expectedTotal: 698, separationUndecided: true }),
    );
    expect(items.map((item) => [item.key, item.state])).toEqual([
      ["order", "ok"],
      ["agreement", "ok"],
      ["schedule", "warn"],
      ["copy", "warn"],
      ["policy", "warn"],
    ]);
    expect(items[3]!.title).toBe("Copy · 2 messages linked, 1 awaiting approval");
  });

  it("marks what is missing outright", () => {
    const items = computeReadiness(
      input({
        hasAgreement: false,
        lineCount: 0,
        expectedTotal: 0,
        copyLinked: 0,
        copyApproved: 0,
      }),
    );
    expect(items.map((item) => item.state)).toEqual(["ok", "warn", "missing", "missing", "ok"]);
    expect(countReady(items)).toEqual({ done: 2, total: 5 });
  });
});
