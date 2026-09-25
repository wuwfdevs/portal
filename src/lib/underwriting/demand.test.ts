import { describe, expect, it } from "vitest";
import {
  computeBucketFulfillment,
  describeScheduleLine,
  reviewScheduleLine,
  summarizeLineFulfillment,
  weekStartOf,
  type DemandBucketLike,
} from "./demand";
import {
  FDOH_ESCAMBIA,
  FPM_FPL,
  PHIL_HALL_2022,
  PUNK_309,
  SYMPHONY,
  SYMPHONY_2021,
  WEST_MOSS,
  compile,
  toScheduleLine,
} from "./fixtures/insertion-orders";

function bucketsFor(
  fixtureIndex: number,
  order = FDOH_ESCAMBIA,
  status: DemandBucketLike["status"] = "active",
): { line: ReturnType<typeof toScheduleLine>; buckets: DemandBucketLike[] } {
  const fixture = order.lines[fixtureIndex]!;
  return {
    line: toScheduleLine(fixture),
    buckets: compile(fixture).map((b, i) => ({
      id: `b${i}`,
      period_start: b.periodStart,
      period_end: b.periodEnd,
      quantity_required: b.quantity,
      status,
      source_label: b.sourceLabel,
    })),
  };
}

describe("weekStartOf", () => {
  it("returns the Monday on or before the date", () => {
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28");
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28");
  });
});

describe("per-bucket fulfillment", () => {
  it("does not count a missed unit and its makegood as two deliveries", () => {
    const { line, buckets } = bucketsFor(0);
    const week = buckets.slice(0, 1);
    const [fulfillment] = computeBucketFulfillment(line, week, [
      { bucketId: "b0", isMakegood: false, outcome: "not_aired" },
      { bucketId: "b0", isMakegood: true, outcome: "aired" },
      { bucketId: "b0", isMakegood: false, outcome: "aired" },
      { bucketId: "b0", isMakegood: false, outcome: "pending" },
    ]);
    expect(fulfillment).toMatchObject({
      quantity: 4,
      scheduled: 1,
      aired: 1,
      missed: 1,
      makegoodsAired: 1,
      delivered: 2,
      freshShortfall: 1,
    });
  });

  it("treats a missed fresh placement as consuming its unit — the replacement comes through the makegood, never fresh demand", () => {
    const { line, buckets } = bucketsFor(0);
    const [f] = computeBucketFulfillment(
      line,
      buckets.slice(0, 1),
      Array.from({ length: 4 }, () => ({
        bucketId: "b0",
        isMakegood: false,
        outcome: "not_aired" as const,
      })),
      [{ bucketId: "b0", awaitingSlot: true }],
    );
    expect(f!.freshShortfall).toBe(0);
    expect(f!.makegoodsAwaitingSlot).toBe(1);
  });

  it("a superseded or cancelled bucket never has a shortfall", () => {
    const { line, buckets } = bucketsFor(0, FDOH_ESCAMBIA, "superseded");
    const fulfillment = computeBucketFulfillment(line, buckets.slice(0, 2), []);
    expect(fulfillment.every((b) => b.freshShortfall === 0)).toBe(true);
  });

  it("lists each bucket's eligible dates under the line's weekdays", () => {
    const { line, buckets } = bucketsFor(0);
    const [first, second] = computeBucketFulfillment(line, buckets.slice(0, 2), []);
    expect(first!.eligibleDates).toEqual(["2026-07-01", "2026-07-02", "2026-07-03"]); // Wed–Fri, first partial week
    expect(second!.eligibleDates).toHaveLength(5);
  });
});

describe("summarizeLineFulfillment", () => {
  it("behind when a past bucket is short, fulfilled when every bucket delivered", () => {
    const { line, buckets } = bucketsFor(0);
    const two = buckets.slice(0, 2);
    const short = computeBucketFulfillment(line, two, []);
    expect(
      summarizeLineFulfillment(short, { openExceptions: 0, openMakegoods: 0 }, "2026-08-01").status,
    ).toBe("behind");
    const full = computeBucketFulfillment(
      line,
      two,
      two.flatMap((b) =>
        Array.from({ length: 4 }, () => ({
          bucketId: b.id,
          isMakegood: false,
          outcome: "aired" as const,
        })),
      ),
    );
    expect(
      summarizeLineFulfillment(full, { openExceptions: 0, openMakegoods: 0 }, "2026-08-01").status,
    ).toBe("fulfilled");
    expect(
      summarizeLineFulfillment(full, { openExceptions: 1, openMakegoods: 0 }, "2026-08-01").status,
    ).toBe("behind");
  });

  it("a bonus line is never behind, and reports itself as bonus", () => {
    const bonus = FPM_FPL.lines[4]!;
    const line = toScheduleLine(bonus);
    const buckets = compile(bonus)
      .slice(0, 2)
      .map((b, i) => ({
        id: `bn${i}`,
        period_start: b.periodStart,
        period_end: b.periodEnd,
        quantity_required: b.quantity,
        status: "active" as const,
        source_label: b.sourceLabel,
      }));
    const summary = summarizeLineFulfillment(
      computeBucketFulfillment(line, buckets, []),
      { openExceptions: 1, openMakegoods: 0 },
      "2026-12-31",
      "bonus",
    );
    expect(summary.bonus).toBe(true);
    expect(summary.status).toBe("on_track");
    expect(summary.freshShortfall).toBe(18);
  });

  it("superseded buckets drop out of the expected total (a revision changes future demand, not history)", () => {
    const { line, buckets } = bucketsFor(0);
    const mixed = buckets
      .slice(0, 3)
      .map((b, i) => (i === 2 ? { ...b, status: "superseded" as const } : b));
    const summary = summarizeLineFulfillment(
      computeBucketFulfillment(line, mixed, [
        { bucketId: "b0", isMakegood: false, outcome: "aired" },
      ]),
      { openExceptions: 0, openMakegoods: 0 },
      "2026-07-01",
    );
    expect(summary.expected).toBe(8);
    expect(summary.delivered).toBe(1);
  });
});

describe("describeScheduleLine", () => {
  it("reads like the order", () => {
    expect(
      describeScheduleLine(toScheduleLine(FDOH_ESCAMBIA.lines[0]!), { poolName: "Drive Time" }),
    ).toBe("4 Drive Time credits a week, each weekday, at most 1 a day");
    expect(
      describeScheduleLine(toScheduleLine(PHIL_HALL_2022.lines[1]!), {
        programName: "Marketplace",
      }),
    ).toBe('1 Marketplace credit each Wed in the "marketplace.opening" position');
    expect(
      describeScheduleLine(toScheduleLine(PHIL_HALL_2022.lines[0]!), { poolName: "Carpool" }),
    ).toBe("1 Carpool credit each Tue at 7:06 AM");
    expect(
      describeScheduleLine(toScheduleLine(FPM_FPL.lines[4]!), {
        poolName: "Total Program Rotation",
      }),
    ).toBe("180 Total Program Rotation credits across 48 listed weeks, any day (bonus)");
    const gala = toScheduleLine(SYMPHONY.lines.find((l) => l.label.includes("Gala"))!);
    expect(describeScheduleLine(gala, { poolName: "AM Drive" })).toContain(
      "cancelled from 2026-04-20",
    );
  });
});

describe("reviewScheduleLine", () => {
  const contract = (order: { effective_from: string; effective_to: string | null }) => order;

  it("flags the 309 Punk 'Oct. 3' start (a Saturday) rather than resolving it", () => {
    const fixture = PUNK_309.lines[0]!;
    const warnings = reviewScheduleLine(
      toScheduleLine(fixture),
      compile(fixture),
      contract(PUNK_309),
    );
    expect(warnings.map((w) => w.code)).toContain("start_day_not_eligible");
    expect(warnings.find((w) => w.code === "start_day_not_eligible")!.message).toContain(
      "2026-10-09",
    );
  });

  it("flags a stated total that disagrees with the compiled buckets (Phil Hall's 27 Saturdays, the Symphony's six-for-five)", () => {
    const weekend = PHIL_HALL_2022.lines[3]!;
    expect(
      reviewScheduleLine(toScheduleLine(weekend), compile(weekend), contract(PHIL_HALL_2022)).map(
        (w) => w.code,
      ),
    ).toContain("stated_total_mismatch");
    const am = SYMPHONY_2021.lines[0]!;
    expect(
      reviewScheduleLine(toScheduleLine(am), compile(am), contract(SYMPHONY_2021)).map(
        (w) => w.code,
      ),
    ).toContain("stated_total_mismatch");
  });

  it("flags the Symphony's revised flight for landing after the order's own end date", () => {
    const brunch = SYMPHONY.lines.find((l) => l.label.includes("Jazz Brunch"))!;
    expect(
      reviewScheduleLine(toScheduleLine(brunch), compile(brunch), contract(SYMPHONY)).map(
        (w) => w.code,
      ),
    ).toContain("outside_contract");
  });

  it("flags a partial first period and counts it at full quantity", () => {
    const fdoh = FDOH_ESCAMBIA.lines[0]!;
    const warnings = reviewScheduleLine(
      toScheduleLine(fdoh),
      compile(fdoh),
      contract(FDOH_ESCAMBIA),
    );
    expect(warnings.map((w) => w.code)).toEqual(["partial_period"]);
  });

  it("is quiet for a clean position-keyed order", () => {
    const moss = WEST_MOSS.lines[0]!;
    const warnings = reviewScheduleLine(toScheduleLine(moss), compile(moss), contract(WEST_MOSS));
    expect(warnings.map((w) => w.code)).toEqual(["partial_period"]); // starts on a Saturday
    const noKey = { ...toScheduleLine(moss), required_opportunity_key: null };
    expect(
      reviewScheduleLine(noKey, compile(moss), contract(WEST_MOSS)).map((w) => w.code),
    ).toContain("slot_needs_key");
  });
});
