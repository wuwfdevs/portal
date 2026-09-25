import { describe, expect, it } from "vitest";
import {
  datesNeedingInventory,
  planInventorySelection,
  spreadDates,
  type BucketDemand,
  type CandidateBreak,
  type CopyCandidate,
  type SelectionDemand,
} from "./inventory-selection";
import { eligibleDatesInBucket } from "./eligibility";
import {
  BOYLES,
  CHORAL_SOCIETY,
  FDOH_ESCAMBIA,
  FPM_USF,
  NATURAL_AWAKENINGS,
  NEW_SOUTH_WINDOWS,
  compile,
  toScheduleLine,
  type FixtureOrder,
} from "./fixtures/insertion-orders";

function brk(
  overrides: Partial<CandidateBreak> & { breakId: string; airDate: string },
): CandidateBreak {
  return {
    minutesOfDay: 7 * 60 + 49,
    scheduledAt: `${overrides.airDate}T12:49:00Z`,
    rundownStatus: "generated",
    remainingSeconds: 90,
    lastItemUnderwriterId: null,
    lastItemCategoryId: null,
    holdsThisContract: false,
    bucketId: "",
    ...overrides,
  };
}

function copy(overrides: Partial<CopyCandidate> = {}): CopyCandidate {
  return {
    id: "copy-a",
    approvalStatus: "approved",
    durationSeconds: 30,
    effectiveFrom: "2020-01-01",
    effectiveTo: null,
    flightId: null,
    existingUsageCount: 0,
    ...overrides,
  };
}

/** The scheduler's demand for one fixture line — every compiled bucket, with the line's eligible dates. */
function demandFor(
  order: FixtureOrder,
  lineIndex: number,
  overrides: Partial<SelectionDemand> = {},
): SelectionDemand {
  const fixture = order.lines[lineIndex]!;
  const line = toScheduleLine(fixture);
  const buckets: BucketDemand[] = compile(fixture).map((b, i) => ({
    bucketId: `b${i}`,
    periodStart: b.periodStart,
    periodEnd: b.periodEnd,
    quantity: b.quantity,
    eligibleDates: eligibleDatesInBucket(line, {
      id: `b${i}`,
      period_start: b.periodStart,
      period_end: b.periodEnd,
      quantity_required: b.quantity,
      status: "active",
    }),
  }));
  return {
    buckets,
    existingPlacements: [],
    makegoodsAwaitingSlot: [],
    maxPerDay: fixture.max_per_day,
    preferredTimeMinutes: null,
    underwriterId: "uw-1",
    categoryId: null,
    lineFlightId: null,
    separationMinutes: null,
    todayISO: "2020-01-01",
    nowISO: "2020-01-01T00:00:00Z",
    ...overrides,
  };
}

/** Candidate breaks on each date, tagged with the bucket that date falls in. */
function breaksOn(
  demand: SelectionDemand,
  dates: string[],
  minutes: number[] = [7 * 60 + 49],
): CandidateBreak[] {
  return dates.flatMap((airDate) =>
    minutes.map((minutesOfDay) =>
      brk({
        breakId: `b-${airDate}-${minutesOfDay}`,
        airDate,
        minutesOfDay,
        bucketId: demand.buckets.find((b) => b.eligibleDates.includes(airDate))?.bucketId ?? "",
      }),
    ),
  );
}

const only = (demand: SelectionDemand, ...indexes: number[]): SelectionDemand => ({
  ...demand,
  buckets: indexes.map((i) => demand.buckets[i]!),
});

describe("spreadDates", () => {
  it("spreads three picks across seven days", () => {
    expect(spreadDates(["1", "2", "3", "4", "5", "6", "7"], 3)).toEqual(["1", "4", "7"]);
  });
  it("returns everything when asked for at least as many as exist", () => {
    expect(spreadDates(["1", "2"], 5)).toEqual(["1", "2"]);
  });
});

describe("Boyles' Weekend Edition quota", () => {
  it("places one credit a week, Saturday or Sunday, never both", () => {
    const demand = only(demandFor(BOYLES, 2, { todayISO: "2026-09-21" }), 0, 1);
    const breaks = breaksOn(
      demand,
      demand.buckets.flatMap((b) => b.eligibleDates),
    );
    const plan = planInventorySelection(breaks, demand, [copy()]);
    expect(plan.items).toHaveLength(2);
    expect(plan.items.map((i) => i.bucketId)).toEqual(["b0", "b1"]);
    expect(plan.unplaceable).toEqual([]);
  });

  it("plans nothing more once the week's unit is already placed (idempotent re-run)", () => {
    const demand = only(
      demandFor(BOYLES, 2, {
        todayISO: "2026-09-21",
        existingPlacements: [
          { bucketId: "b0", airDate: "2026-09-26", minutesOfDay: 469, isMakegood: false },
        ],
      }),
      0,
    );
    const plan = planInventorySelection(breaksOn(demand, ["2026-09-26", "2026-09-27"]), demand, [
      copy(),
    ]);
    expect(plan.items).toEqual([]);
  });
});

describe("Natural Awakenings' 3 a week, max 1 a day", () => {
  it("spreads three credits across the seven eligible days, never seven", () => {
    const demand = only(demandFor(NATURAL_AWAKENINGS, 0, { todayISO: "2026-04-13" }), 0);
    const plan = planInventorySelection(
      breaksOn(demand, demand.buckets[0]!.eligibleDates),
      demand,
      [copy()],
    );
    expect(plan.items.map((i) => i.airDate)).toEqual(["2026-04-13", "2026-04-16", "2026-04-19"]);
  });

  it("reports the shortfall when only two days have inventory", () => {
    const demand = only(demandFor(NATURAL_AWAKENINGS, 0, { todayISO: "2026-04-13" }), 0);
    const plan = planInventorySelection(breaksOn(demand, ["2026-04-14", "2026-04-16"]), demand, [
      copy(),
    ]);
    expect(plan.items).toHaveLength(2);
    expect(plan.unplaceable).toEqual([{ bucketId: "b0", reason: "fresh", why: "day_cap" }]);
  });
});

describe("FDOH's 4 a week, 1 a day (a data-driven cap)", () => {
  it("never stacks two on one day even when a day offers two breaks", () => {
    const demand = only(demandFor(FDOH_ESCAMBIA, 0, { todayISO: "2026-07-06" }), 1);
    const breaks = breaksOn(demand, demand.buckets[0]!.eligibleDates, [6 * 60 + 6, 7 * 60 + 49]);
    const plan = planInventorySelection(breaks, demand, [copy()]);
    expect(plan.items).toHaveLength(4);
    expect(new Set(plan.items.map((i) => i.airDate)).size).toBe(4);
  });
});

describe("New South's 10 a week with no cap", () => {
  it("lands two a day across the five weekdays rather than ten on Monday", () => {
    const demand = only(demandFor(NEW_SOUTH_WINDOWS, 0, { todayISO: "2025-08-11" }), 0);
    const breaks = breaksOn(demand, demand.buckets[0]!.eligibleDates, [
      6 * 60 + 6,
      7 * 60 + 6,
      8 * 60 + 6,
    ]);
    const plan = planInventorySelection(breaks, demand, [copy()]);
    expect(plan.items).toHaveLength(10);
    const perDay = new Map<string, number>();
    for (const item of plan.items) perDay.set(item.airDate, (perDay.get(item.airDate) ?? 0) + 1);
    expect([...perDay.values()]).toEqual([2, 2, 2, 2, 2]);
    expect(plan.unplaceable).toEqual([]);
  });
});

describe("Choral Society's two AM credits a day", () => {
  it("places both in distinct eligible opportunities on the same day", () => {
    const demand = only(demandFor(CHORAL_SOCIETY, 1, { todayISO: "2026-10-12" }), 0);
    const breaks = breaksOn(demand, ["2026-10-12"], [7 * 60 + 49, 8 * 60 + 19]);
    const plan = planInventorySelection(breaks, demand, [copy()]);
    expect(plan.items.map((i) => i.breakId).sort()).toEqual([
      "b-2026-10-12-469",
      "b-2026-10-12-499",
    ]);
  });

  it("warns when the clock only offers one break that day", () => {
    const demand = only(demandFor(CHORAL_SOCIETY, 1, { todayISO: "2026-10-12" }), 0);
    const plan = planInventorySelection(breaksOn(demand, ["2026-10-12"]), demand, [copy()]);
    expect(plan.items).toHaveLength(1);
    expect(plan.unplaceable).toEqual([
      { bucketId: "b0", reason: "fresh", why: "already_in_break" },
    ]);
  });
});

describe("USF's two Friday credits in the Putumayo hour", () => {
  it("reports infeasible capacity rather than stacking both into one undersized break", () => {
    const demand = only(demandFor(FPM_USF, 0, { todayISO: "2026-04-06" }), 0);
    const breaks = [
      brk({
        breakId: "putumayo",
        airDate: "2026-04-10",
        minutesOfDay: 19 * 60 + 30,
        remainingSeconds: 15,
        bucketId: "b0",
      }),
    ];
    const plan = planInventorySelection(breaks, demand, [copy({ durationSeconds: 15 })]);
    expect(plan.items).toHaveLength(1);
    expect(plan.unplaceable[0]!.why).toBe("already_in_break");
  });
  it("with no marked opportunity in the hour at all, places nothing and says so", () => {
    const demand = only(demandFor(FPM_USF, 0, { todayISO: "2026-04-06" }), 0);
    const plan = planInventorySelection([], demand, [copy()]);
    expect(plan.unplaceable.map((u) => u.why)).toEqual(["no_inventory", "no_inventory"]);
  });
});

describe("contractual and adjacency rules", () => {
  const demand = only(
    demandFor(BOYLES, 0, {
      todayISO: "2026-09-21",
      underwriterId: "boyles",
      categoryId: "cat-legal",
    }),
    0,
  );

  it("skips a break whose last credit is the same underwriter or the same industry", () => {
    const breaks = [
      brk({
        breakId: "mon-self",
        airDate: "2026-09-21",
        lastItemUnderwriterId: "boyles",
        bucketId: "b0",
      }),
      brk({
        breakId: "tue-rival",
        airDate: "2026-09-22",
        lastItemUnderwriterId: "other-firm",
        lastItemCategoryId: "cat-legal",
        bucketId: "b0",
      }),
      brk({ breakId: "wed", airDate: "2026-09-23", bucketId: "b0" }),
      brk({ breakId: "thu", airDate: "2026-09-24", bucketId: "b0" }),
    ];
    const plan = planInventorySelection(breaks, demand, [copy()]);
    expect(plan.items.map((i) => i.breakId)).toEqual(["wed", "thu"]);
  });

  it("never uses a break this contract already holds", () => {
    const breaks = [
      brk({ breakId: "held", airDate: "2026-09-21", holdsThisContract: true, bucketId: "b0" }),
      brk({ breakId: "free", airDate: "2026-09-22", bucketId: "b0" }),
    ];
    expect(planInventorySelection(breaks, demand, [copy()]).items.map((i) => i.breakId)).toEqual([
      "free",
    ]);
  });

  it("only places approved, in-date, contract-wide or same-flight copy, rotating by least use", () => {
    const breaks = breaksOn(demand, ["2026-09-21", "2026-09-23"]);
    const copies = [
      copy({ id: "draft", approvalStatus: "draft" }),
      copy({ id: "other-flight", flightId: "flight-x" }),
      copy({ id: "expired", effectiveTo: "2026-09-01" }),
      copy({ id: "a", existingUsageCount: 2 }),
      copy({ id: "b", existingUsageCount: 1 }),
    ];
    expect(planInventorySelection(breaks, demand, copies).items.map((i) => i.copyId)).toEqual([
      "b",
      "a",
    ]);
  });

  it("keeps same-day credits apart under a min_minutes separation policy", () => {
    const two = only(
      demandFor(CHORAL_SOCIETY, 1, { todayISO: "2026-10-12", separationMinutes: 60 }),
      0,
    );
    const breaks = breaksOn(two, ["2026-10-12"], [7 * 60 + 49, 8 * 60 + 19, 6 * 60 + 6]);
    const plan = planInventorySelection(breaks, two, [copy()]);
    expect(plan.items.map((i) => i.breakId).sort()).toEqual([
      "b-2026-10-12-366",
      "b-2026-10-12-469",
    ]);
  });

  it("prefers the break closest to the preferred time within a day", () => {
    const preferred = { ...demand, preferredTimeMinutes: 8 * 60 + 6 };
    const breaks = breaksOn(
      preferred,
      ["2026-09-21", "2026-09-22"],
      [6 * 60 + 6, 8 * 60 + 6, 8 * 60 + 44],
    );
    const plan = planInventorySelection(breaks, preferred, [copy()]);
    expect(plan.items.map((i) => i.breakId)).toEqual(["b-2026-09-21-486", "b-2026-09-22-486"]);
  });

  it("never plans into the past", () => {
    const plan = planInventorySelection(
      breaksOn(demand, ["2026-09-21", "2026-09-22"]),
      { ...demand, todayISO: "2026-09-22" },
      [copy()],
    );
    expect(plan.items.map((i) => i.airDate)).toEqual(["2026-09-22"]);
  });
});

describe("makegoods drain first", () => {
  it("places an awaiting-slot makegood on the earliest eligible day, attributed to the bucket it replaces", () => {
    const demand = only(
      demandFor(BOYLES, 0, {
        todayISO: "2026-09-28",
        makegoodsAwaitingSlot: [{ id: "mg-1", bucketId: "b0" }],
      }),
      1,
    );
    const plan = planInventorySelection(
      breaksOn(demand, ["2026-09-28", "2026-09-29", "2026-09-30"]),
      demand,
      [copy()],
    );
    expect(plan.items[0]).toMatchObject({
      reason: "makegood",
      makegoodId: "mg-1",
      bucketId: "b0",
      airDate: "2026-09-28",
    });
    expect(plan.items.filter((i) => i.reason === "fresh").map((i) => i.airDate)).toEqual([
      "2026-09-29",
      "2026-09-30",
    ]);
  });
});

describe("datesNeedingInventory", () => {
  it("names exactly the shortfall's worth of open days that have no break yet, spread across the week", () => {
    const demand = only(demandFor(NATURAL_AWAKENINGS, 0, { todayISO: "2026-04-13" }), 0);
    expect(datesNeedingInventory(demand, [], 3)).toEqual([
      "2026-04-13",
      "2026-04-16",
      "2026-04-19",
    ]);
    expect(datesNeedingInventory(demand, breaksOn(demand, ["2026-04-13"]), 3)).toHaveLength(2);
  });

  it("asks for nothing when the bucket is already covered", () => {
    const demand = only(
      demandFor(BOYLES, 2, {
        todayISO: "2026-09-21",
        existingPlacements: [
          { bucketId: "b0", airDate: "2026-09-26", minutesOfDay: 480, isMakegood: false },
        ],
      }),
      0,
    );
    expect(datesNeedingInventory(demand, [], 5)).toEqual([]);
  });
});

describe("frozen rundowns", () => {
  it("never plans into a live or submitted rundown, or a break that has already started", () => {
    const demand = only(
      demandFor(BOYLES, 2, { todayISO: "2026-09-21", nowISO: "2026-09-21T12:30:00Z" }),
      0,
      1,
      2,
    );
    const dates = demand.buckets.map((bucket) => bucket.eligibleDates[0]!);
    const live = breaksOn(demand, [dates[0]!]).map((b) => ({
      ...b,
      rundownStatus: "in_progress" as const,
    }));
    const past = breaksOn(demand, [dates[1]!]).map((b) => ({
      ...b,
      scheduledAt: "2026-09-21T12:00:00Z",
    }));
    const open = breaksOn(demand, [dates[2]!]);
    const plan = planInventorySelection([...live, ...past, ...open], demand, [copy()]);
    expect(plan.items.map((item) => item.breakId)).toEqual(open.map((b) => b.breakId));
  });
});
