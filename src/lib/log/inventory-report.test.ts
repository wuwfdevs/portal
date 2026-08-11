import { describe, expect, it } from "vitest";
import { bucketKeyForDate, computeClockCapacity, computeInventoryTrend } from "./inventory-report";

describe("computeClockCapacity", () => {
  it("splits a clock's total structure into local-eligible vs. network time", () => {
    const capacity = computeClockCapacity(
      [{ duration_seconds: 2000 }, { duration_seconds: 1600 }],
      [
        { requirement: "optional", active: true, slot: { duration_seconds: 90 } },
        { requirement: "required", active: true, slot: { duration_seconds: 90 } },
      ],
    );
    expect(capacity).toEqual({
      totalSeconds: 3600,
      localEligibleSeconds: 180,
      requiredSeconds: 90,
      networkSeconds: 3420,
    });
  });

  it("ignores inactive opportunities", () => {
    const capacity = computeClockCapacity(
      [{ duration_seconds: 3600 }],
      [{ requirement: "optional", active: false, slot: { duration_seconds: 90 } }],
    );
    expect(capacity).toMatchObject({ localEligibleSeconds: 0, networkSeconds: 3600 });
  });

  it("a clock with no marked opportunities is entirely network time", () => {
    const capacity = computeClockCapacity([{ duration_seconds: 3600 }], []);
    expect(capacity).toEqual({
      totalSeconds: 3600,
      localEligibleSeconds: 0,
      requiredSeconds: 0,
      networkSeconds: 3600,
    });
  });
});

describe("bucketKeyForDate", () => {
  it("buckets a week to its own Monday", () => {
    // 2026-08-13 is a Thursday.
    expect(bucketKeyForDate("2026-08-13", "week")).toEqual({ key: "2026-08-10", startDate: "2026-08-10" });
  });

  it("a Monday buckets to itself", () => {
    expect(bucketKeyForDate("2026-08-10", "week")).toEqual({ key: "2026-08-10", startDate: "2026-08-10" });
  });

  it("a Sunday buckets to the Monday before it, not the one after", () => {
    expect(bucketKeyForDate("2026-08-16", "week")).toEqual({ key: "2026-08-10", startDate: "2026-08-10" });
  });

  it("buckets a month to its own first-of-month", () => {
    expect(bucketKeyForDate("2026-08-13", "month")).toEqual({ key: "2026-08", startDate: "2026-08-01" });
  });
});

describe("computeInventoryTrend", () => {
  const rundown = {
    id: "rd-1",
    program_id: "prog-1",
    air_date: "2026-08-13",
    shift_start_at: "2026-08-13T10:00:00.000Z",
    shift_end_at: "2026-08-13T11:00:00.000Z",
  };

  it("partitions total shift time into network vs. local-available seconds", () => {
    const breaks = [
      {
        id: "brk-1",
        rundown_id: "rd-1",
        requirement: "optional" as const,
        available_duration_seconds: 90,
        scheduled_at: "2026-08-13T10:19:00.000Z",
        network_rejoin_at: "2026-08-13T10:20:30.000Z",
      },
    ];
    const [bucket] = computeInventoryTrend([rundown], breaks, [], "week");
    expect(bucket).toMatchObject({
      rundownCount: 1,
      totalSeconds: 3600,
      localAvailableSeconds: 90,
      networkSeconds: 3510,
      localUsedSeconds: 0,
    });
  });

  it("sums placed items' planned duration as local used time", () => {
    const breaks = [
      {
        id: "brk-1",
        rundown_id: "rd-1",
        requirement: "optional" as const,
        available_duration_seconds: 90,
        scheduled_at: "2026-08-13T10:19:00.000Z",
        network_rejoin_at: "2026-08-13T10:20:30.000Z",
      },
    ];
    const items = [
      { break_id: "brk-1", planned_duration_seconds: 30 },
      { break_id: "brk-1", planned_duration_seconds: 30 },
    ];
    const [bucket] = computeInventoryTrend([rundown], breaks, items, "week");
    expect(bucket?.localUsedSeconds).toBe(60);
  });

  it("classifies an empty required break as unresolved and an empty optional one as carrying network", () => {
    const breaks = [
      {
        id: "brk-required",
        rundown_id: "rd-1",
        requirement: "required" as const,
        available_duration_seconds: 90,
        scheduled_at: "2026-08-13T10:19:00.000Z",
        network_rejoin_at: "2026-08-13T10:20:30.000Z",
      },
      {
        id: "brk-optional",
        rundown_id: "rd-1",
        requirement: "optional" as const,
        available_duration_seconds: 60,
        scheduled_at: "2026-08-13T10:40:00.000Z",
        network_rejoin_at: "2026-08-13T10:41:00.000Z",
      },
    ];
    const [bucket] = computeInventoryTrend([rundown], breaks, [], "week");
    expect(bucket?.breakCounts).toMatchObject({ unresolved_required: 1, carrying_network: 1, filled: 0 });
  });

  it("groups multiple rundowns into the same week bucket", () => {
    const rundownTue = { ...rundown, id: "rd-2", air_date: "2026-08-11" };
    const buckets = computeInventoryTrend([rundown, rundownTue], [], [], "week");
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ key: "2026-08-10", rundownCount: 2, totalSeconds: 7200 });
  });

  it("splits rundowns in different weeks into separate, sorted buckets", () => {
    const rundownNextWeek = { ...rundown, id: "rd-2", air_date: "2026-08-20" };
    const buckets = computeInventoryTrend([rundownNextWeek, rundown], [], [], "week");
    expect(buckets.map((bucket) => bucket.key)).toEqual(["2026-08-10", "2026-08-17"]);
  });

  it("returns no buckets for no rundowns", () => {
    expect(computeInventoryTrend([], [], [], "week")).toEqual([]);
  });
});
