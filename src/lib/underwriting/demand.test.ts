import { describe, expect, it } from "vitest";
import {
  computePeriodFulfillment,
  describeScheduleLine,
  expandDemandPeriods,
  expectedTotal,
  periodForDate,
  reviewScheduleLine,
  summarizeLineFulfillment,
  weekStartOf,
  type DemandPeriod,
} from "./demand";
import {
  ARMSTRONG,
  AUTUMN_BECK_BLACKLEDGE,
  BOYLES,
  BUD_AND_ALLEYS,
  CHORAL_SOCIETY,
  EMERALD_COAST_THEATRE,
  FPM_FPL,
  FPM_USF,
  LIVE_NATION,
  LYNN_KEEFE,
  MOVE_PERIOD,
  NATURAL_AWAKENINGS,
  OPEN_BOOKS,
  PUNK_309,
  SYMPHONY,
  type FixtureLine,
  type FixtureOrder,
} from "./fixtures/insertion-orders";

function expand(fixtureLine: FixtureLine): DemandPeriod[] {
  return expandDemandPeriods(fixtureLine, fixtureLine.allocations);
}

function orderTotal(
  order: FixtureOrder,
  filter: (line: FixtureLine) => boolean = () => true,
): number {
  return order.lines
    .filter(filter)
    .reduce((sum, fixtureLine) => sum + expectedTotal(expand(fixtureLine)), 0);
}

describe("weekStartOf", () => {
  it("returns the Monday on or before the date", () => {
    expect(weekStartOf("2026-09-28")).toBe("2026-09-28"); // Monday
    expect(weekStartOf("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(weekStartOf("2026-10-01")).toBe("2026-09-28"); // Thursday
  });
});

// Acceptance scenario 1 --------------------------------------------------------

describe("Autumn Beck Blackledge (reference agreement)", () => {
  it("still forecasts 104 spots across its four weekly recurrences", () => {
    expect(orderTotal(AUTUMN_BECK_BLACKLEDGE)).toBe(104);
    for (const fixtureLine of AUTUMN_BECK_BLACKLEDGE.lines) {
      expect(expectedTotal(expand(fixtureLine))).toBe(fixtureLine.stated_total);
    }
  });

  it("sells one calendar day per period", () => {
    const periods = expand(AUTUMN_BECK_BLACKLEDGE.lines[0]!);
    expect(periods[0]).toMatchObject({
      kind: "day",
      periodStart: "2026-08-03",
      quantity: 1,
      maxPerDay: 1,
    });
    expect(periods.every((p) => p.eligibleDates.length === 1)).toBe(true);
  });
});

// Acceptance scenario 2 --------------------------------------------------------

describe("Boyles & Boyles", () => {
  it("forecasts 2 drive + 3 rotation + 1 Weekend Edition per week, 52 weeks", () => {
    const [drive, rotation, weekend] = BOYLES.lines;
    expect(expectedTotal(expand(drive!))).toBe(104);
    expect(expectedTotal(expand(rotation!))).toBe(156);
    expect(expectedTotal(expand(weekend!))).toBe(52);
    expect(orderTotal(BOYLES)).toBe(312);
  });

  it("gives the Weekend Edition line one unit a week with both Saturday and Sunday eligible, never two", () => {
    const periods = expand(BOYLES.lines[2]!);
    expect(periods).toHaveLength(52);
    expect(periods[0]).toMatchObject({ kind: "week", quantity: 1, maxPerDay: 1 });
    expect(periods[0]!.eligibleDates).toEqual(["2026-09-26", "2026-09-27"]);
  });
});

// Acceptance scenario 3 --------------------------------------------------------

describe("Natural Awakenings", () => {
  it("forecasts 3 rotation spots a week — 156, not 7 a week", () => {
    const periods = expand(NATURAL_AWAKENINGS.lines[0]!);
    expect(periods).toHaveLength(52);
    expect(periods.every((p) => p.quantity === 3 && p.eligibleDates.length === 7)).toBe(true);
    expect(expectedTotal(periods)).toBe(156);
  });
});

// Acceptance scenario 4 --------------------------------------------------------

describe("Move Period", () => {
  it("forecasts the weekday/pool split: 39 AM + 13 PM + 26 rotation over 13 weeks", () => {
    const [am, pm, rotation] = MOVE_PERIOD.lines;
    expect(expectedTotal(expand(am!))).toBe(39);
    expect(expectedTotal(expand(pm!))).toBe(13);
    expect(expectedTotal(expand(rotation!))).toBe(26);
    expect(orderTotal(MOVE_PERIOD)).toBe(78);
  });
});

// Acceptance scenario 5 --------------------------------------------------------

describe("Bud & Alley's", () => {
  it("forecasts both drive phases (92) and the first-week rotation exception (42)", () => {
    expect(orderTotal(BUD_AND_ALLEYS, (l) => l.pool === "AM Drive" || l.pool === "PM Drive")).toBe(
      92,
    );
    expect(orderTotal(BUD_AND_ALLEYS, (l) => l.pool === "Total Program Rotation")).toBe(42);
  });

  it("never double counts across the phase boundary: no week appears in both AM phases", () => {
    const phase1 = expand(BUD_AND_ALLEYS.lines[0]!).map((p) => p.periodStart);
    const phase2 = expand(BUD_AND_ALLEYS.lines[2]!).map((p) => p.periodStart);
    expect(phase1[phase1.length - 1]).toBe("2026-04-20");
    expect(phase2[0]).toBe("2026-04-27");
    expect(phase1.filter((week) => phase2.includes(week))).toEqual([]);
  });

  it("flags nothing as a partial week — every phase starts on a Monday and ends on a Sunday", () => {
    for (const fixtureLine of BUD_AND_ALLEYS.lines) {
      expect(expand(fixtureLine).some((p) => p.partialWeek)).toBe(false);
    }
  });
});

// Named-feature orders ---------------------------------------------------------

describe("Lynn Keefe Pediatrics and Open Books", () => {
  it("forecast 52 Tuesdays and 52 Thursdays, each keeping the contracted time as the target", () => {
    expect(expectedTotal(expand(LYNN_KEEFE.lines[0]!))).toBe(52);
    expect(expectedTotal(expand(OPEN_BOOKS.lines[0]!))).toBe(52);
    expect(LYNN_KEEFE.lines[0]!.target_time).toBe("08:19");
    expect(OPEN_BOOKS.lines[0]!.target_time).toBe("08:44");
  });
});

// Acceptance scenario 8 --------------------------------------------------------

describe("309 Punk Project", () => {
  it("switches from Friday 7:49 to Thursday 8:19 on the specified dates, 17 credits in all", () => {
    const [friday, thursday] = PUNK_309.lines;
    const fridays = expand(friday!);
    const thursdays = expand(thursday!);
    expect(fridays.map((p) => p.periodStart)).toEqual(["2026-10-09", "2026-10-16", "2026-10-23"]);
    expect(thursdays[0]!.periodStart).toBe("2026-10-29");
    expect(thursdays[thursdays.length - 1]!.periodStart).toBe("2027-01-28");
    expect(fridays.length + thursdays.length).toBe(17);
  });

  it("flags the printed 'Oct. 3' start (a Saturday) for review rather than resolving it", () => {
    const friday = PUNK_309.lines[0]!;
    const warnings = reviewScheduleLine(friday, friday.allocations, expand(friday), PUNK_309);
    expect(warnings.map((w) => w.code)).toContain("start_day_not_eligible");
    expect(warnings.find((w) => w.code === "start_day_not_eligible")?.message).toContain(
      "2026-10-09",
    );
  });
});

// Acceptance scenario 6 --------------------------------------------------------

describe("Choral Society", () => {
  it("asks for two AM credits on one weekday in the second week of each flight — 60 in all", () => {
    expect(orderTotal(CHORAL_SOCIETY)).toBe(60);
    const week2 = expand(CHORAL_SOCIETY.lines[1]!);
    expect(week2).toHaveLength(5);
    expect(week2.every((p) => p.quantity === 2 && p.maxPerDay === 2)).toBe(true);
  });
});

// Acceptance scenario 7 --------------------------------------------------------

describe("Emerald Coast Theatre", () => {
  it("previews each production's exact dates and totals — 28 AM drive, 36 ROS — with nothing in the gaps", () => {
    expect(orderTotal(EMERALD_COAST_THEATRE, (l) => l.pool === "AM Drive")).toBe(28);
    expect(orderTotal(EMERALD_COAST_THEATRE, (l) => l.pool === "Total Program Rotation")).toBe(36);
    for (const fixtureLine of EMERALD_COAST_THEATRE.lines) {
      expect(expectedTotal(expand(fixtureLine))).toBe(fixtureLine.stated_total);
    }
    // Nothing between #2 (ends Oct 25) and #3 (starts Dec 2).
    const all = EMERALD_COAST_THEATRE.lines.flatMap(expand).map((p) => p.periodStart);
    expect(all.some((d) => d > "2026-10-25" && d < "2026-12-02")).toBe(false);
  });

  it("is not eligible on an unlisted date", () => {
    const fixtureLine = EMERALD_COAST_THEATRE.lines[0]!;
    expect(periodForDate(fixtureLine, fixtureLine.allocations, "2026-09-12")).toBeNull();
    expect(periodForDate(fixtureLine, fixtureLine.allocations, "2026-09-11")).toMatchObject({
      quantity: 1,
    });
  });
});

describe("Live Nation", () => {
  it("expands the agency's dated window grid to nine one-a-day units", () => {
    expect(orderTotal(LIVE_NATION)).toBe(9);
    for (const fixtureLine of LIVE_NATION.lines) {
      expect(expand(fixtureLine).map((p) => p.periodStart)).toEqual([
        "2026-05-18",
        "2026-05-20",
        "2026-05-22",
      ]);
    }
  });
});

// Acceptance scenario 9 --------------------------------------------------------

describe("FPM / USF", () => {
  it("forecasts two Friday credits a week in the Putumayo hour, 22 over 11 weeks", () => {
    const periods = expand(FPM_USF.lines[0]!);
    expect(periods).toHaveLength(11);
    expect(periods.every((p) => p.kind === "day" && p.quantity === 2 && p.maxPerDay === 2)).toBe(
      true,
    );
    expect(expectedTotal(periods)).toBe(22);
    expect(periods[0]!.periodStart).toBe("2026-04-10");
  });

  it("keeps the agency's 'separation: 3' as source text, uninterpreted", () => {
    expect(FPM_USF.separation_source_text).toBe("3");
  });
});

// Acceptance scenario 10 -------------------------------------------------------

describe("FPM / FPL", () => {
  it("produces the grid's weekly counts, including zero weeks and the bonus line, summing to 540", () => {
    const totals = FPM_FPL.lines.map((fixtureLine) => expectedTotal(expand(fixtureLine)));
    expect(totals).toEqual([108, 96, 84, 72, 180]);
    expect(orderTotal(FPM_FPL)).toBe(540);
  });

  it("drops the zero weeks (3/23, 5/25, 8/24, 11/23) from demand rather than inventing a quantity", () => {
    const am = expand(FPM_FPL.lines[0]!);
    const weeks = am.map((p) => p.periodStart);
    expect(am).toHaveLength(44);
    for (const zero of ["2026-03-23", "2026-05-25", "2026-08-24", "2026-11-23"]) {
      expect(weeks).not.toContain(zero);
      expect(periodForDate(FPM_FPL.lines[0]!, FPM_FPL.lines[0]!.allocations, zero)).toBeNull();
    }
  });

  it("reads a week's quantity from the grid for any date in it", () => {
    const am = FPM_FPL.lines[0]!;
    expect(periodForDate(am, am.allocations, "2026-01-28")).toMatchObject({
      periodStart: "2026-01-26",
      quantity: 6,
      maxPerDay: 2,
    });
    expect(periodForDate(am, am.allocations, "2026-01-31")).toBeNull(); // Saturday, weekday line
  });

  it("marks makegoods as needing agency approval", () => {
    expect(FPM_FPL.makegood_requires_agency_approval).toBe(true);
    expect(FPM_FPL.lines[4]!.is_bonus).toBe(true);
  });
});

// Acceptance scenario 11 -------------------------------------------------------

describe("Symphony (updated order) and Armstrong (cancelled)", () => {
  it("a cancelled flight's line expands to nothing while its replacement carries the demand", () => {
    const cancelled = SYMPHONY.lines.find((l) => l.label.includes("cancelled"))!;
    const revised = SYMPHONY.lines.find((l) => l.label.includes("revised"))!;
    expect(expand(cancelled)).toEqual([]);
    expect(expectedTotal(expand(revised))).toBe(5);
    expect(orderTotal(SYMPHONY)).toBe(28);
  });

  it("flags the revised flight for landing after the order's own end date", () => {
    const revised = SYMPHONY.lines.find((l) => l.label.includes("revised"))!;
    const warnings = reviewScheduleLine(revised, revised.allocations, expand(revised), SYMPHONY);
    expect(warnings.map((w) => w.code)).toContain("outside_contract");
  });

  it("Armstrong's 'Wed or Thursday' PM spot is one unit a week with two eligible days", () => {
    const pm = ARMSTRONG.lines[1]!;
    const periods = expand(pm);
    expect(periods).toHaveLength(7);
    expect(periods[0]!.eligibleDates).toEqual(["2026-05-06", "2026-05-07"]);
    expect(orderTotal(ARMSTRONG)).toBe(56);
  });

  it("a line cancelled part-way keeps its earlier periods and drops the rest", () => {
    const am = {
      ...ARMSTRONG.lines[0]!,
      status: "cancelled" as const,
      cancelled_from: "2026-05-11",
    };
    const periods = expand(am);
    expect(periods.map((p) => p.periodStart)).toEqual([
      "2026-05-04",
      "2026-05-05",
      "2026-05-06",
      "2026-05-07",
      "2026-05-08",
    ]);
    expect(periodForDate(am, [], "2026-05-11")).toBeNull();
  });
});

// Review warnings ----------------------------------------------------------------

describe("reviewScheduleLine", () => {
  it("warns when the stated total disagrees with the expansion", () => {
    const fixtureLine = { ...NATURAL_AWAKENINGS.lines[0]!, stated_total: 150 };
    const warnings = reviewScheduleLine(fixtureLine, [], expand(fixtureLine), NATURAL_AWAKENINGS);
    expect(warnings.find((w) => w.code === "stated_total_mismatch")?.message).toContain("156");
  });

  it("warns about a partial week and counts it at full quota", () => {
    const fixtureLine = {
      ...NATURAL_AWAKENINGS.lines[0]!,
      start_date: "2026-04-15",
      end_date: "2026-04-26",
      stated_total: null,
    };
    const periods = expand(fixtureLine);
    expect(periods).toHaveLength(2);
    expect(periods[0]).toMatchObject({ partialWeek: true, quantity: 3 });
    expect(periods[0]!.eligibleDates).toEqual([
      "2026-04-15",
      "2026-04-16",
      "2026-04-17",
      "2026-04-18",
      "2026-04-19",
    ]);
    expect(
      reviewScheduleLine(fixtureLine, [], periods, NATURAL_AWAKENINGS).map((w) => w.code),
    ).toContain("partial_week");
  });

  it("is quiet for a clean order", () => {
    for (const fixtureLine of BOYLES.lines) {
      expect(reviewScheduleLine(fixtureLine, [], expand(fixtureLine), BOYLES)).toEqual([]);
    }
  });
});

// Descriptions ---------------------------------------------------------------------

describe("describeScheduleLine", () => {
  it("reads like the order", () => {
    expect(describeScheduleLine(CHORAL_SOCIETY.lines[1]!, [], { poolName: "AM Drive" })).toBe(
      "2 AM Drive credits each weekday",
    );
    expect(
      describeScheduleLine(NATURAL_AWAKENINGS.lines[0]!, [], {
        poolName: "Total Program Rotation",
      }),
    ).toBe("3 Total Program Rotation credits a week, any day, at most 1 a day");
    expect(describeScheduleLine(LYNN_KEEFE.lines[0]!, [], { poolName: "Carpool" })).toBe(
      "1 Carpool credit Tue, targeting 8:19 AM",
    );
    expect(
      describeScheduleLine(FPM_USF.lines[0]!, [], { programName: "Putumayo World Music Hour" }),
    ).toBe("2 Putumayo World Music Hour credits Fri between 7:00 PM and 8:00 PM");
    expect(describeScheduleLine(BOYLES.lines[2]!, [], { poolName: "Weekend Edition" })).toBe(
      "1 Weekend Edition credit a week, Saturday or Sunday, at most 1 a day",
    );
  });
});

// Fulfillment ----------------------------------------------------------------------

describe("per-period fulfillment", () => {
  const periods = expand(FPM_USF.lines[0]!).slice(0, 2); // 4/10 and 4/17, two each

  it("does not count a missed unit and its makegood as two deliveries", () => {
    const result = computePeriodFulfillment(periods, [
      {
        demandPeriodStart: "2026-04-10",
        placementDate: "2026-04-10",
        isMakegood: false,
        outcome: "aired",
      },
      {
        demandPeriodStart: "2026-04-10",
        placementDate: "2026-04-10",
        isMakegood: false,
        outcome: "not_aired",
      },
      // The makegood for the missed one aired the next week but is attributed to 4/10.
      {
        demandPeriodStart: "2026-04-10",
        placementDate: "2026-04-17",
        isMakegood: true,
        outcome: "aired",
      },
    ]);
    expect(result[0]).toMatchObject({
      aired: 1,
      missed: 1,
      makegoodsAired: 1,
      delivered: 2,
      freshShortfall: 0,
    });
    expect(result[1]).toMatchObject({ aired: 0, freshShortfall: 2, delivered: 0 });
  });

  it("treats a missed fresh placement as consuming its unit — the replacement comes through the makegood, never fresh demand", () => {
    const result = computePeriodFulfillment(
      periods,
      [
        {
          demandPeriodStart: "2026-04-10",
          placementDate: "2026-04-10",
          isMakegood: false,
          outcome: "not_aired",
        },
      ],
      [{ demandPeriodStart: "2026-04-10", awaitingSlot: true }],
    );
    expect(result[0]).toMatchObject({ freshShortfall: 1, makegoodsAwaitingSlot: 1 });
  });

  it("summarizes a line as behind when a past period is short, fulfilled when every period delivered", () => {
    const full = computePeriodFulfillment(periods, [
      {
        demandPeriodStart: "2026-04-10",
        placementDate: "2026-04-10",
        isMakegood: false,
        outcome: "aired",
      },
      {
        demandPeriodStart: "2026-04-10",
        placementDate: "2026-04-10",
        isMakegood: false,
        outcome: "aired",
      },
      {
        demandPeriodStart: "2026-04-17",
        placementDate: "2026-04-17",
        isMakegood: false,
        outcome: "aired",
      },
      {
        demandPeriodStart: "2026-04-17",
        placementDate: "2026-04-17",
        isMakegood: false,
        outcome: "aired",
      },
    ]);
    expect(
      summarizeLineFulfillment(full, { openExceptions: 0, openMakegoods: 0 }, "2026-05-01").status,
    ).toBe("fulfilled");

    const short = computePeriodFulfillment(periods, [
      {
        demandPeriodStart: "2026-04-10",
        placementDate: "2026-04-10",
        isMakegood: false,
        outcome: "aired",
      },
    ]);
    expect(
      summarizeLineFulfillment(short, { openExceptions: 0, openMakegoods: 0 }, "2026-05-01"),
    ).toMatchObject({
      status: "behind",
      expected: 4,
      delivered: 1,
      periodsBehind: 2,
    });
    expect(
      summarizeLineFulfillment(short, { openExceptions: 0, openMakegoods: 0 }, "2026-04-01").status,
    ).toBe("on_track");
  });
});
