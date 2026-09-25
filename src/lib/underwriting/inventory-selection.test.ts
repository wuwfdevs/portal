import { describe, expect, it } from "vitest";
import { expandDemandPeriods } from "./demand";
import {
  datesNeedingInventory,
  planInventorySelection,
  spreadDates,
  type CandidateBreak,
  type CopyCandidate,
  type SelectionDemand,
} from "./inventory-selection";
import { BOYLES, CHORAL_SOCIETY, FPM_USF, NATURAL_AWAKENINGS } from "./fixtures/insertion-orders";

function brk(
  overrides: Partial<CandidateBreak> & { breakId: string; airDate: string },
): CandidateBreak {
  return {
    minutesOfDay: 7 * 60 + 49,
    remainingSeconds: 90,
    lastItemUnderwriterId: null,
    lastItemCategory: null,
    holdsThisContract: false,
    ...overrides,
  };
}

function copy(overrides: Partial<CopyCandidate> = {}): CopyCandidate {
  return {
    id: "copy-a",
    approvalStatus: "approved",
    durationSeconds: 30,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    flightId: null,
    existingUsageCount: 0,
    ...overrides,
  };
}

function demandFor(
  fixtureIndex: {
    lines: {
      allocations:
        never[] | { period_kind: "day" | "week"; period_start: string; quantity: number }[];
    }[];
  },
  lineIndex: number,
  overrides: Partial<SelectionDemand> = {},
): SelectionDemand {
  const line = (fixtureIndex as typeof BOYLES).lines[lineIndex]!;
  return {
    periods: expandDemandPeriods(line, line.allocations),
    existingPlacements: [],
    makegoodsAwaitingSlot: [],
    underwriterId: "uw-1",
    category: null,
    targetTimeMinutes: null,
    lineFlightId: null,
    separationMinutes: null,
    todayISO: "2026-01-01",
    ...overrides,
  };
}

/** One 90-second AM break per date, at 7:49. */
function breaksOn(dates: string[], minutesOfDay = 7 * 60 + 49): CandidateBreak[] {
  return dates.map((airDate) =>
    brk({ breakId: `b-${airDate}-${minutesOfDay}`, airDate, minutesOfDay }),
  );
}

describe("spreadDates", () => {
  it("spreads three picks across seven days", () => {
    expect(spreadDates(["1", "2", "3", "4", "5", "6", "7"], 3)).toEqual(["1", "4", "7"]);
  });
  it("returns everything when asked for at least as many as exist", () => {
    expect(spreadDates(["1", "2"], 5)).toEqual(["1", "2"]);
  });
});

// Acceptance scenario 2 --------------------------------------------------------

describe("Boyles' Weekend Edition quota", () => {
  it("places one credit a week, Saturday or Sunday, never both", () => {
    const demand = demandFor(BOYLES, 2, { todayISO: "2026-09-21" });
    const firstTwoWeeks = demand.periods.slice(0, 2);
    const breaks = breaksOn(firstTwoWeeks.flatMap((p) => p.eligibleDates)); // Sat + Sun both weeks
    const plan = planInventorySelection(breaks, { ...demand, periods: firstTwoWeeks }, [copy()]);

    expect(plan.items).toHaveLength(2);
    expect(plan.items.map((i) => i.periodStart)).toEqual(["2026-09-21", "2026-09-28"]);
    expect(plan.unplaceable).toEqual([]);
  });

  it("plans nothing more once the week's unit is already placed (idempotent re-run)", () => {
    const demand = demandFor(BOYLES, 2, {
      todayISO: "2026-09-21",
      existingPlacements: [
        {
          periodStart: "2026-09-21",
          airDate: "2026-09-26",
          minutesOfDay: 7 * 60 + 49,
          isMakegood: false,
        },
      ],
    });
    const week = [demand.periods[0]!];
    const plan = planInventorySelection(
      breaksOn(["2026-09-26", "2026-09-27"]),
      { ...demand, periods: week },
      [copy()],
    );
    expect(plan.items).toEqual([]);
  });
});

// Acceptance scenario 3 --------------------------------------------------------

describe("Natural Awakenings' 3 a week", () => {
  it("spreads three credits across the seven eligible days, never seven", () => {
    const demand = demandFor(NATURAL_AWAKENINGS, 0, { todayISO: "2026-04-13" });
    const week = [demand.periods[0]!];
    const plan = planInventorySelection(
      breaksOn(week[0]!.eligibleDates),
      { ...demand, periods: week },
      [copy()],
    );
    expect(plan.items.map((i) => i.airDate)).toEqual(["2026-04-13", "2026-04-16", "2026-04-19"]);
  });

  it("reports the shortfall when only two days have inventory", () => {
    const demand = demandFor(NATURAL_AWAKENINGS, 0, { todayISO: "2026-04-13" });
    const week = [demand.periods[0]!];
    const plan = planInventorySelection(
      breaksOn(["2026-04-14", "2026-04-15"]),
      { ...demand, periods: week },
      [copy()],
    );
    expect(plan.items).toHaveLength(2);
    expect(plan.unplaceable).toEqual([
      { periodStart: "2026-04-13", reason: "fresh", why: "day_cap" },
    ]);
  });
});

// Acceptance scenario 6 --------------------------------------------------------

describe("Choral Society's two AM credits a day", () => {
  it("places both in distinct eligible opportunities on the same day", () => {
    const demand = demandFor(CHORAL_SOCIETY, 1, {
      todayISO: "2026-10-12",
      underwriterId: "choral",
    });
    const monday = [demand.periods[0]!]; // 2026-10-12, quantity 2
    const breaks = [
      brk({ breakId: "6:06", airDate: "2026-10-12", minutesOfDay: 6 * 60 + 6 }),
      brk({ breakId: "7:49", airDate: "2026-10-12", minutesOfDay: 7 * 60 + 49 }),
      brk({ breakId: "8:19", airDate: "2026-10-12", minutesOfDay: 8 * 60 + 19 }),
    ];
    const plan = planInventorySelection(breaks, { ...demand, periods: monday }, [copy()]);
    expect(plan.items).toHaveLength(2);
    expect(new Set(plan.items.map((i) => i.breakId)).size).toBe(2);
    expect(plan.unplaceable).toEqual([]);
  });

  it("warns when the clock only offers one break that day", () => {
    const demand = demandFor(CHORAL_SOCIETY, 1, {
      todayISO: "2026-10-12",
      underwriterId: "choral",
    });
    const monday = [demand.periods[0]!];
    const plan = planInventorySelection(
      [brk({ breakId: "only", airDate: "2026-10-12" })],
      { ...demand, periods: monday },
      [copy()],
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.unplaceable).toEqual([
      { periodStart: "2026-10-12", reason: "fresh", why: "already_in_break" },
    ]);
  });
});

// Acceptance scenario 9 --------------------------------------------------------

describe("USF's two Friday credits in the Putumayo hour", () => {
  it("reports infeasible capacity rather than stacking both into one undersized break", () => {
    const demand = demandFor(FPM_USF, 0, { todayISO: "2026-04-06" });
    const friday = [demand.periods[0]!]; // 2026-04-10, quantity 2
    const plan = planInventorySelection(
      [
        brk({
          breakId: "19:06",
          airDate: "2026-04-10",
          minutesOfDay: 19 * 60 + 6,
          remainingSeconds: 20,
        }),
      ],
      { ...demand, periods: friday },
      [copy({ durationSeconds: 15 })],
    );
    expect(plan.items).toHaveLength(1);
    expect(plan.unplaceable).toHaveLength(1);
  });

  it("with no marked opportunity in the hour at all, places nothing and says so", () => {
    const demand = demandFor(FPM_USF, 0, { todayISO: "2026-04-06" });
    const friday = [demand.periods[0]!];
    const plan = planInventorySelection([], { ...demand, periods: friday }, [
      copy({ durationSeconds: 15 }),
    ]);
    expect(plan.items).toEqual([]);
    expect(plan.unplaceable.map((u) => u.why)).toEqual(["no_inventory", "no_inventory"]);
  });
});

// Acceptance scenario 12 -------------------------------------------------------

describe("contractual and adjacency rules", () => {
  const demand = demandFor(BOYLES, 0, {
    todayISO: "2026-09-21",
    underwriterId: "boyles",
    category: "Lawyers",
  });
  const week = [demand.periods[0]!];

  it("skips a break whose last credit is the same underwriter or the same industry", () => {
    const breaks = [
      brk({ breakId: "mon-self", airDate: "2026-09-21", lastItemUnderwriterId: "boyles" }),
      brk({
        breakId: "tue-rival",
        airDate: "2026-09-22",
        lastItemUnderwriterId: "other-firm",
        lastItemCategory: "Lawyers",
      }),
      brk({ breakId: "wed", airDate: "2026-09-23" }),
      brk({ breakId: "thu", airDate: "2026-09-24" }),
    ];
    const plan = planInventorySelection(breaks, { ...demand, periods: week }, [copy()]);
    expect(plan.items.map((i) => i.breakId)).toEqual(["wed", "thu"]);
  });

  it("never uses a break this contract already holds", () => {
    const breaks = [
      brk({ breakId: "held", airDate: "2026-09-21", holdsThisContract: true }),
      brk({ breakId: "free", airDate: "2026-09-22" }),
    ];
    const plan = planInventorySelection(breaks, { ...demand, periods: week }, [copy()]);
    expect(plan.items.map((i) => i.breakId)).toEqual(["free"]);
  });

  it("only places approved, in-date, contract-wide or same-flight copy, rotating by least use", () => {
    const breaks = breaksOn(["2026-09-21", "2026-09-23"]);
    const copies = [
      copy({ id: "draft", approvalStatus: "draft" }),
      copy({ id: "other-flight", flightId: "flight-x" }),
      copy({ id: "expired", effectiveTo: "2026-09-01" }),
      copy({ id: "a", existingUsageCount: 2 }),
      copy({ id: "b", existingUsageCount: 1 }),
    ];
    const plan = planInventorySelection(breaks, { ...demand, periods: week }, copies);
    expect(plan.items.map((i) => i.copyId)).toEqual(["b", "a"]);
  });

  it("keeps same-day credits apart under a min_minutes separation policy", () => {
    const two = demandFor(CHORAL_SOCIETY, 1, { todayISO: "2026-10-12", separationMinutes: 60 });
    const monday = [two.periods[0]!];
    const breaks = [
      brk({ breakId: "7:49", airDate: "2026-10-12", minutesOfDay: 7 * 60 + 49 }),
      brk({ breakId: "8:19", airDate: "2026-10-12", minutesOfDay: 8 * 60 + 19 }), // 30 min later — too close
      brk({ breakId: "6:06", airDate: "2026-10-12", minutesOfDay: 6 * 60 + 6 }),
    ];
    const plan = planInventorySelection(breaks, { ...two, periods: monday }, [copy()]);
    expect(plan.items.map((i) => i.breakId).sort()).toEqual(["6:06", "7:49"]);
  });

  it("never plans into the past", () => {
    const plan = planInventorySelection(
      breaksOn(["2026-09-21", "2026-09-22"]),
      { ...demand, periods: week, todayISO: "2026-09-22" },
      [copy()],
    );
    expect(plan.items.map((i) => i.airDate)).toEqual(["2026-09-22"]);
  });
});

describe("makegoods drain first", () => {
  it("places an awaiting-slot makegood on the earliest eligible day, attributed to the period it replaces", () => {
    const demand = demandFor(BOYLES, 0, {
      todayISO: "2026-09-28",
      makegoodsAwaitingSlot: [{ id: "mg-1", periodStart: "2026-09-21" }],
    });
    const week = [demand.periods[1]!]; // 2026-09-28
    const plan = planInventorySelection(
      breaksOn(["2026-09-28", "2026-09-29", "2026-09-30"]),
      { ...demand, periods: week },
      [copy()],
    );
    expect(plan.items[0]).toMatchObject({
      reason: "makegood",
      makegoodId: "mg-1",
      periodStart: "2026-09-21",
      airDate: "2026-09-28",
    });
    // The week's own two fresh units still get placed, on other days.
    expect(plan.items.filter((i) => i.reason === "fresh").map((i) => i.airDate)).toEqual([
      "2026-09-29",
      "2026-09-30",
    ]);
  });
});

describe("datesNeedingInventory", () => {
  it("names exactly the shortfall's worth of open days that have no break yet, spread across the week", () => {
    const demand = demandFor(NATURAL_AWAKENINGS, 0, { todayISO: "2026-04-13" });
    const week = [demand.periods[0]!];
    expect(datesNeedingInventory({ ...demand, periods: week }, [], 3)).toEqual([
      "2026-04-13",
      "2026-04-16",
      "2026-04-19",
    ]);
    expect(
      datesNeedingInventory({ ...demand, periods: week }, breaksOn(["2026-04-13"]), 3),
    ).toHaveLength(2);
  });

  it("asks for nothing when the period is already covered", () => {
    const demand = demandFor(BOYLES, 2, {
      todayISO: "2026-09-21",
      existingPlacements: [
        { periodStart: "2026-09-21", airDate: "2026-09-26", minutesOfDay: 480, isMakegood: false },
      ],
    });
    expect(datesNeedingInventory({ ...demand, periods: [demand.periods[0]!] }, [], 5)).toEqual([]);
  });
});
