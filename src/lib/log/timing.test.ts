import { describe, expect, it } from "vitest";
import {
  computeBreakFit,
  computeBreakStatus,
  computeBreakStatuses,
  computeRundownSummary,
  type RundownSummaryBreakLike,
  type SpilloverBreakLike,
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

function spilloverBreak(overrides: Partial<SpilloverBreakLike> = {}): SpilloverBreakLike {
  const index = breakSequence++;
  return {
    id: `spillover-break-${index}`,
    requirement: "required",
    available_duration_seconds: 30,
    occupied_duration_seconds: 30,
    item_count: 1,
    scheduled_at: new Date(2026, 0, 1, 6, index * 10, 0).toISOString(),
    network_rejoin_at: new Date(2026, 0, 1, 6, index * 10 + 1, 0).toISOString(),
    ...overrides,
  };
}

describe("computeBreakStatuses (spillover)", () => {
  it("a long item covers the immediately next break when it's empty, optional, and adjacent", () => {
    // Music Bed: 60s window, a 200s feature placed in it (140s over).
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 200,
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    // Segment: starts exactly where Music Bed rejoins, empty, optional, 180s window (>= 140s overage).
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 180,
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:04:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("filled");
    expect(byId.get("segment")?.status).toBe("covered_by_previous");
    expect(byId.get("segment")?.coveredByBreakId).toBe("music-bed");
  });

  it("does not cover a break separated by a gap", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 200,
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 180,
      occupied_duration_seconds: 0,
      item_count: 0,
      // Starts a minute after Music Bed's own rejoin point — a real gap.
      scheduled_at: "2026-08-09T10:02:00.000Z",
      network_rejoin_at: "2026-08-09T10:05:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("over");
    expect(byId.get("segment")?.status).toBe("carrying_network");
  });

  it("does not cover a required next break — a genuine local obligation is never silently swallowed", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 200,
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const legalId = spilloverBreak({
      id: "legal-id",
      requirement: "required",
      available_duration_seconds: 180,
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:04:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, legalId]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("over");
    expect(byId.get("legal-id")?.status).toBe("unresolved_required");
  });

  it("does not cover a next break that already has its own content", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 200,
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 180,
      occupied_duration_seconds: 30,
      item_count: 1,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:04:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("over");
    expect(byId.get("segment")?.status).toBe("filled");
  });

  it("leaves both breaks honestly over/carrying_network when the overage exceeds even the next break's window", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 600, // 540s over
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 180, // not enough to absorb 540s
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:04:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("over");
    expect(byId.get("segment")?.status).toBe("carrying_network");
  });

  it("an item that fits its own break covers nothing, regardless of neighbors", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 60,
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 180,
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:04:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("filled");
    expect(byId.get("segment")?.status).toBe("carrying_network");
  });
});

let breakSequence = 0;

// Defaults space each break several minutes apart from a fresh "sequence" so
// unrelated summaryBreak() calls within a test never accidentally register
// as adjacent — spillover eligibility is deliberately exercised only by
// tests that set scheduled_at/network_rejoin_at to line up on purpose.
function summaryBreak(overrides: Partial<RundownSummaryBreakLike> = {}): RundownSummaryBreakLike {
  const index = breakSequence++;
  return {
    id: `break-${index}`,
    requirement: "required",
    available_duration_seconds: 30,
    occupied_duration_seconds: 30,
    item_count: 1,
    scheduled_at: new Date(2026, 0, 1, 6, index * 10, 0).toISOString(),
    network_rejoin_at: new Date(2026, 0, 1, 6, index * 10 + 1, 0).toISOString(),
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

  it("a break covered by a neighbor's overrunning content counts as filled, not over or carrying network", () => {
    const summary = computeRundownSummary([
      summaryBreak({
        requirement: "optional",
        available_duration_seconds: 60,
        occupied_duration_seconds: 200,
        item_count: 1,
        scheduled_at: "2026-08-09T10:00:00.000Z",
        network_rejoin_at: "2026-08-09T10:01:00.000Z",
      }),
      summaryBreak({
        requirement: "optional",
        available_duration_seconds: 180,
        occupied_duration_seconds: 0,
        item_count: 0,
        scheduled_at: "2026-08-09T10:01:00.000Z",
        network_rejoin_at: "2026-08-09T10:04:00.000Z",
      }),
    ]);
    expect(summary).toMatchObject({
      filledBreaks: 2,
      carryingNetworkBreaks: 0,
      unresolvedRequiredBreaks: 0,
      overCount: 0,
      totalOverSeconds: 0,
      ready: true,
    });
  });
});
