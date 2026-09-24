import { describe, expect, it } from "vitest";
import {
  computeBreakFit,
  computeBreakStatus,
  computeBreakStatuses,
  computeItemTimings,
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

let breakSequence = 0;

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
  // 2026-08-10 revision: the required/optional polarity here is the
  // opposite of what an earlier pass shipped, and deliberately so — see
  // CLAUDE.md's dated note. requirement = 'required' means local content is
  // mandatory in that window; spillover (itself local content) satisfies
  // that silently. requirement = 'optional' usually sits over real network
  // content nobody chose to preempt this time, so spillover into it is
  // absorbed but flagged, not hidden.

  it("silently covers an empty, required, contiguous next break — a mandatory local window is satisfied by any local content, spillover included", () => {
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

    expect(byId.get("music-bed")?.status).toBe("filled");
    expect(byId.get("legal-id")?.status).toBe("covered_by_previous");
    expect(byId.get("legal-id")?.coveredByBreakId).toBe("music-bed");
  });

  it("flags — but still absorbs — spillover into an empty, optional, contiguous next break, since real network content may have been bumped", () => {
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
    expect(byId.get("segment")?.status).toBe("preempted_by_previous");
    expect(byId.get("segment")?.coveredByBreakId).toBe("music-bed");
  });

  it("leaves partial capacity in a preempted break fillable — e.g. exactly using it up still reads as consumed, not carrying network", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 100, // 40s over
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 40, // exactly enough to absorb the 40s overage
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:02:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("segment")?.status).toBe("preempted_by_previous");
    expect(byId.get("segment")?.fit.remainingSeconds).toBe(0);
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

  it("chains through more than one hop — a music bed, then a required legal ID window, then an optional segment", () => {
    const musicBed = spilloverBreak({
      id: "music-bed",
      requirement: "optional",
      available_duration_seconds: 60,
      occupied_duration_seconds: 400, // 340s over
      item_count: 1,
      scheduled_at: "2026-08-09T10:00:00.000Z",
      network_rejoin_at: "2026-08-09T10:01:00.000Z",
    });
    const legalId = spilloverBreak({
      id: "legal-id",
      requirement: "required",
      available_duration_seconds: 90,
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:02:30.000Z",
    });
    const segment = spilloverBreak({
      id: "segment",
      requirement: "optional",
      available_duration_seconds: 600, // plenty of room for the remaining 250s
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:02:30.000Z",
      network_rejoin_at: "2026-08-09T10:12:30.000Z",
    });

    const results = computeBreakStatuses([musicBed, legalId, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    expect(byId.get("music-bed")?.status).toBe("filled");
    expect(byId.get("legal-id")?.status).toBe("covered_by_previous");
    expect(byId.get("legal-id")?.coveredByBreakId).toBe("music-bed");
    // The second hop is credited from the legal-id break, the last link in the chain it actually reached through.
    expect(byId.get("segment")?.status).toBe("preempted_by_previous");
    expect(byId.get("segment")?.coveredByBreakId).toBe("legal-id");
    expect(byId.get("segment")?.fit.remainingSeconds).toBe(350); // 600 - 250 remaining overage
  });

  it("leaves the source honestly over, and stops crediting the chain, once the overage exceeds every reachable break's combined window", () => {
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
      available_duration_seconds: 180, // not enough to absorb 540s, and nothing follows it
      occupied_duration_seconds: 0,
      item_count: 0,
      scheduled_at: "2026-08-09T10:01:00.000Z",
      network_rejoin_at: "2026-08-09T10:04:00.000Z",
    });

    const results = computeBreakStatuses([musicBed, segment]);
    const byId = new Map(results.map((r) => [r.id, r]));

    // The source stays over — the chain never fully accounted for the overage.
    expect(byId.get("music-bed")?.status).toBe("over");
    // The downstream break still gets credit for what it genuinely absorbed (its own full 180s capacity).
    expect(byId.get("segment")?.status).toBe("preempted_by_previous");
    expect(byId.get("segment")?.fit.remainingSeconds).toBe(0);
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

describe("computeItemTimings", () => {
  it("starts the first item exactly at the break's own scheduled time", () => {
    const [first] = computeItemTimings("2026-08-09T10:00:00.000Z", [{ id: "a", durationSeconds: 30 }]);
    expect(first).toMatchObject({
      id: "a",
      startAt: "2026-08-09T10:00:00.000Z",
      endAt: "2026-08-09T10:00:30.000Z",
    });
  });

  it("stacks each following item's start at the previous item's end, in order", () => {
    const timings = computeItemTimings("2026-08-09T10:00:00.000Z", [
      { id: "a", durationSeconds: 30 },
      { id: "b", durationSeconds: 15 },
      { id: "c", durationSeconds: 45 },
    ]);
    expect(timings).toEqual([
      { id: "a", startAt: "2026-08-09T10:00:00.000Z", endAt: "2026-08-09T10:00:30.000Z" },
      { id: "b", startAt: "2026-08-09T10:00:30.000Z", endAt: "2026-08-09T10:00:45.000Z" },
      { id: "c", startAt: "2026-08-09T10:00:45.000Z", endAt: "2026-08-09T10:01:30.000Z" },
    ]);
  });

  it("returns an empty list for an empty break", () => {
    expect(computeItemTimings("2026-08-09T10:00:00.000Z", [])).toEqual([]);
  });
});

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
      preemptedBreaks: 0,
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

  it("a required break covered by a neighbor's overrunning content counts as filled, not over or unresolved", () => {
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
        requirement: "required",
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
      preemptedBreaks: 0,
      ready: true,
    });
  });

  it("an optional break preempted by a neighbor's overrunning content counts as filled and is tallied separately", () => {
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
      preemptedBreaks: 1,
      ready: true,
    });
  });
});
