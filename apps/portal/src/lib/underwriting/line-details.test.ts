import { describe, expect, it } from "vitest";
import type { BucketFulfillment } from "./demand";
import {
  allSettled,
  allUntouched,
  buildPeriodRows,
  foldPeriodRows,
  formatDateRange,
  type PeriodRowPlacementLike,
} from "./line-details";

function bucket(
  id: string,
  start: string,
  overrides: Partial<BucketFulfillment> = {},
): BucketFulfillment {
  return {
    bucketId: id,
    periodStart: start,
    periodEnd: addSix(start),
    sourceLabel: `week of ${start}`,
    quantity: 1,
    status: "active",
    eligibleDates: [start],
    scheduled: 0,
    aired: 0,
    missed: 0,
    makegoodsAwaitingSlot: 0,
    makegoodsScheduled: 0,
    makegoodsAired: 0,
    freshShortfall: 1,
    delivered: 0,
    ...overrides,
  };
}

function addSix(start: string): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().slice(0, 10);
}

function placement(
  id: string,
  bucketId: string,
  scheduledAt: string,
  outcome: PeriodRowPlacementLike["outcome"] = "pending",
  overrides: Partial<PeriodRowPlacementLike> = {},
): PeriodRowPlacementLike {
  return {
    id,
    demand_bucket_id: bucketId,
    scheduled_at: scheduledAt,
    status: "scheduled",
    makegood_id: null,
    override_reason: null,
    outcome,
    ...overrides,
  };
}

describe("buildPeriodRows", () => {
  it("keys each period by its bucket, in period order, with its placements in air order", () => {
    const rows = buildPeriodRows(
      [bucket("b2", "2026-10-05"), bucket("b1", "2026-09-28", { freshShortfall: 0, scheduled: 1 })],
      [
        placement("p2", "b2", "2026-10-05T12:49:00Z"),
        placement("p1", "b1", "2026-09-28T12:49:00Z"),
        placement("p0", "b1", "2026-09-28T11:49:00Z", "pending", { status: "superseded" }),
      ],
    );
    expect(rows.map((row) => row.bucketId)).toEqual(["b1", "b2"]);
    expect(rows[0]!.label).toBe("Week of Sep 28");
    // The superseded placement is dropped; the live one stays.
    expect(rows[0]!.placements.map((p) => p.id)).toEqual(["p1"]);
    expect(rows[0]!.kind).toBe("open");
  });

  it("marks a period settled once every placement has aired and nothing is still needed", () => {
    const [row] = buildPeriodRows(
      [bucket("b1", "2026-09-21", { freshShortfall: 0, aired: 1, delivered: 1 })],
      [placement("p1", "b1", "2026-09-21T12:49:00Z", "aired")],
    );
    expect(row!.kind).toBe("settled");
    expect(row!.needed).toBe(0);
  });

  it("reports a period's remaining fresh units as needed, even alongside a placement", () => {
    const [row] = buildPeriodRows(
      [bucket("b1", "2026-09-28", { quantity: 2, freshShortfall: 1, scheduled: 1 })],
      [placement("p1", "b1", "2026-09-28T12:49:00Z")],
    );
    expect(row!.needed).toBe(1);
    expect(row!.kind).toBe("open");
  });

  it("shows a cancelled bucket as inactive with nothing needed", () => {
    const [row] = buildPeriodRows([bucket("b1", "2026-09-28", { status: "cancelled" })], []);
    expect(row!.kind).toBe("inactive");
    expect(row!.needed).toBe(0);
  });

  it("keeps a period open while a makegood still awaits a slot", () => {
    const [row] = buildPeriodRows(
      [bucket("b1", "2026-09-14", { freshShortfall: 0, missed: 1, makegoodsAwaitingSlot: 1 })],
      [placement("p1", "b1", "2026-09-14T12:49:00Z", "not_aired")],
    );
    expect(row!.kind).toBe("open");
    expect(row!.makegoodsAwaitingSlot).toBe(1);
  });
});

describe("foldPeriodRows", () => {
  const weeks = [
    "2026-09-07",
    "2026-09-14",
    "2026-09-21",
    "2026-09-28",
    "2026-10-05",
    "2026-10-12",
    "2026-10-19",
    "2026-10-26",
    "2026-11-02",
    "2026-11-09",
  ];
  const rows = buildPeriodRows(
    weeks.map((start, i) =>
      bucket(`b${i}`, start, i < 3 ? { freshShortfall: 0, aired: 1, delivered: 1 } : {}),
    ),
    [
      ...[0, 1, 2].map((i) => placement(`p${i}`, `b${i}`, `${weeks[i]}T12:49:00Z`, "aired")),
      placement("p3", "b3", "2026-09-28T12:49:00Z"),
      placement("p4", "b4", "2026-10-05T12:49:00Z"),
    ],
  );

  it("folds settled history above and untouched future below the periods in play", () => {
    const folded = foldPeriodRows(rows);
    expect(folded.earlier.map((r) => r.bucketId)).toEqual(["b0", "b1", "b2"]);
    expect(folded.shown.map((r) => r.bucketId)).toEqual(["b3", "b4", "b5", "b6"]);
    expect(folded.later.map((r) => r.bucketId)).toEqual(["b7", "b8", "b9"]);
    expect(allSettled(folded.earlier)).toBe(true);
    expect(allUntouched(folded.later)).toBe(true);
  });

  it("shows through the last placement when placements run past the minimum", () => {
    const far = [
      ...rows.slice(0, 9),
      { ...rows[9]!, placements: [placement("p9", "b9", "2026-11-09T12:49:00Z")] },
    ];
    const folded = foldPeriodRows(far);
    expect(folded.shown.map((r) => r.bucketId)).toEqual(["b3", "b4", "b5", "b6", "b7", "b8", "b9"]);
    expect(folded.later).toEqual([]);
  });

  it("keeps the last periods visible when every period is settled", () => {
    const done = rows.map((row) => ({ ...row, kind: "settled" as const, needed: 0 }));
    const folded = foldPeriodRows(done);
    expect(folded.earlier).toHaveLength(6);
    expect(folded.shown).toHaveLength(4);
    expect(folded.later).toEqual([]);
  });

  it("pulls settled history back in rather than showing fewer than the minimum", () => {
    const short = rows.slice(0, 4); // three settled, one open
    const folded = foldPeriodRows(short);
    expect(folded.earlier).toEqual([]);
    expect(folded.shown).toHaveLength(4);
  });
});

describe("formatDateRange", () => {
  it("shares one year when both dates fall in it", () => {
    expect(formatDateRange("2026-01-05", "2026-07-05")).toBe("Jan 5 – Jul 5, 2026");
  });
  it("names both years when they differ", () => {
    expect(formatDateRange("2025-12-01", "2026-02-28")).toBe("Dec 1, 2025 – Feb 28, 2026");
  });
  it("says ongoing for an open end", () => {
    expect(formatDateRange("2026-01-05", null)).toBe("from Jan 5, 2026, ongoing");
  });
});
