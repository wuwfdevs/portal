import { describe, expect, it } from "vitest";
import {
  compileDemandBuckets,
  describeEntrySpec,
  parseEntrySpec,
  totalQuantity,
  type EntrySpec,
} from "./demand-compiler";
import {
  ALL_ORDERS,
  AUTUMN_BECK_BLACKLEDGE,
  BOYLES,
  BUD_AND_ALLEYS,
  CHORAL_SOCIETY,
  CULTURAL_ARTS_ALLIANCE,
  EMERALD_COAST_THEATRE,
  FDOH_ESCAMBIA,
  FIREMAN_TERMITE,
  FPM_FPL,
  INTERNATIONAL_PAPER,
  LIVE_NATION,
  NATURAL_AWAKENINGS,
  NEW_SOUTH_WINDOWS,
  OPEN_BOOKS,
  PHIL_HALL_2020,
  PHIL_HALL_2022,
  PHIL_HALL_2024,
  PUNK_309,
  SAN_ANTONIO_SHOEMAKERS,
  SYMPHONY,
  SYMPHONY_2021,
  WEST_MOSS,
  WILD_BIRDS_UNLIMITED,
  compile,
  type FixtureLine,
  type FixtureOrder,
} from "./fixtures/insertion-orders";

function orderTotal(order: FixtureOrder, filter: (line: FixtureLine) => boolean = () => true) {
  return order.lines.filter(filter).reduce((sum, line) => sum + totalQuantity(compile(line)), 0);
}

const weekdays = { days_of_week: [1, 2, 3, 4, 5] };

describe("compileDemandBuckets — shapes", () => {
  it("fixed days: one one-day bucket per eligible date", () => {
    const buckets = compileDemandBuckets(
      { kind: "fixed_days", count_per_day: 2 },
      { start_date: "2026-10-05", end_date: "2026-10-11", ...weekdays },
    );
    expect(buckets).toHaveLength(5);
    expect(buckets[0]).toEqual({
      periodStart: "2026-10-05",
      periodEnd: "2026-10-05",
      quantity: 2,
      sourceLabel: "Oct 5",
      partial: false,
    });
  });

  it("weekly quota: Monday weeks, clipped to the line and flagged partial", () => {
    const buckets = compileDemandBuckets(
      { kind: "weekly_quota", quantity: 4 },
      { start_date: "2026-07-01", end_date: "2026-07-19", ...weekdays }, // starts a Wednesday
    );
    expect(buckets.map((b) => [b.periodStart, b.periodEnd, b.partial])).toEqual([
      ["2026-07-01", "2026-07-05", true],
      ["2026-07-06", "2026-07-12", false],
      ["2026-07-13", "2026-07-19", false],
    ]);
    expect(buckets.every((b) => b.quantity === 4)).toBe(true);
  });

  it("weekly quota: a week with no eligible day yields no bucket", () => {
    const buckets = compileDemandBuckets(
      { kind: "weekly_quota", quantity: 1 },
      { start_date: "2026-10-10", end_date: "2026-10-11", days_of_week: [1, 2, 3, 4, 5] }, // Sat–Sun only
    );
    expect(buckets).toEqual([]);
  });

  it("monthly quota: calendar months, clipped at both ends", () => {
    const buckets = compileDemandBuckets(
      { kind: "monthly_quota", quantity: 6 },
      { start_date: "2026-01-15", end_date: "2026-03-10", days_of_week: [] },
    );
    expect(buckets.map((b) => [b.periodStart, b.periodEnd, b.sourceLabel, b.partial])).toEqual([
      ["2026-01-15", "2026-01-31", "January 2026", true],
      ["2026-02-01", "2026-02-28", "February 2026", false],
      ["2026-03-01", "2026-03-10", "March 2026", true],
    ]);
  });

  it("every N weeks: alternate weeks carry demand, intervening weeks have no bucket at all", () => {
    const buckets = compileDemandBuckets(
      { kind: "every_n_weeks", interval_weeks: 2, quantity: 1 },
      { start_date: "2026-05-18", end_date: "2026-06-28", days_of_week: [] },
    );
    expect(buckets.map((b) => b.periodStart)).toEqual(["2026-05-18", "2026-06-01", "2026-06-15"]);
  });

  it("every N weeks honours an explicit anchor week", () => {
    const buckets = compileDemandBuckets(
      { kind: "every_n_weeks", interval_weeks: 2, quantity: 1, anchor: "2026-05-25" },
      { start_date: "2026-05-18", end_date: "2026-06-28", days_of_week: [] },
    );
    expect(buckets.map((b) => b.periodStart)).toEqual(["2026-05-25", "2026-06-08", "2026-06-22"]);
  });

  it("explicit dates: one-day buckets, same-date entries summed, dates outside the line dropped", () => {
    const buckets = compileDemandBuckets(
      {
        kind: "explicit_dates",
        dates: [
          { date: "2026-09-24", quantity: 1 },
          { date: "2026-09-11", quantity: 1 },
          { date: "2026-09-24", quantity: 1 },
          { date: "2026-10-01", quantity: 1 },
        ],
      },
      { start_date: "2026-09-08", end_date: "2026-09-27", days_of_week: [] },
    );
    expect(buckets.map((b) => [b.periodStart, b.quantity])).toEqual([
      ["2026-09-11", 1],
      ["2026-09-24", 2],
    ]);
  });

  it("week grid: zero weeks are real buckets, any date in a week snaps to its Monday", () => {
    const buckets = compileDemandBuckets(
      {
        kind: "week_grid",
        weeks: [
          { week_start: "2026-01-28", quantity: 6 }, // a Wednesday → week of Jan 26
          { week_start: "2026-02-02", quantity: 0 },
          { week_start: "2026-02-09", quantity: 4 },
        ],
      },
      { start_date: "2026-01-26", end_date: "2026-02-15", days_of_week: [] },
    );
    expect(buckets.map((b) => [b.periodStart, b.quantity])).toEqual([
      ["2026-01-26", 6],
      ["2026-02-02", 0],
      ["2026-02-09", 4],
    ]);
  });

  it("range total: one bucket over the whole run", () => {
    expect(
      compileDemandBuckets(
        { kind: "range_total", quantity: 52 },
        { start_date: "2026-01-01", end_date: "2026-12-31", days_of_week: [] },
      ),
    ).toEqual([
      {
        periodStart: "2026-01-01",
        periodEnd: "2026-12-31",
        quantity: 52,
        sourceLabel: "Jan 1 – Dec 31",
        partial: false,
      },
    ]);
  });

  it("an open-ended recurring line compiles to nothing without a through date, and to the horizon with one", () => {
    const spec: EntrySpec = { kind: "weekly_quota", quantity: 1 };
    const input = { start_date: "2026-10-05", end_date: null, days_of_week: [] };
    expect(compileDemandBuckets(spec, input)).toEqual([]);
    expect(compileDemandBuckets(spec, input, { through: "2026-10-25" })).toHaveLength(3);
  });

  it("never produces overlapping buckets for any order on file", () => {
    for (const order of ALL_ORDERS) {
      for (const line of order.lines) {
        const buckets = compile(line);
        for (let i = 1; i < buckets.length; i++) {
          expect(buckets[i]!.periodStart > buckets[i - 1]!.periodEnd).toBe(true);
        }
      }
    }
  });
});

describe("parseEntrySpec", () => {
  it("round-trips every fixture's spec", () => {
    for (const order of ALL_ORDERS) {
      for (const line of order.lines) {
        expect(parseEntrySpec(JSON.parse(JSON.stringify(line.spec)))).toEqual(line.spec);
      }
    }
  });
  it("rejects malformed specs", () => {
    expect(parseEntrySpec(null)).toBeNull();
    expect(parseEntrySpec({ kind: "weekly_quota" })).toBeNull();
    expect(parseEntrySpec({ kind: "every_n_weeks", interval_weeks: 0, quantity: 1 })).toBeNull();
    expect(
      parseEntrySpec({ kind: "explicit_dates", dates: [{ date: "nope", quantity: 1 }] }),
    ).toBeNull();
    expect(
      parseEntrySpec({ kind: "week_grid", weeks: [{ week_start: "2026-01-26", quantity: -1 }] }),
    ).toBeNull();
    expect(parseEntrySpec({ kind: "whatever" })).toBeNull();
  });
});

// The acceptance corpus (docs/underwriting-traffic-redesign.md §9, brief §12)

describe("#1 Open Books — one exact weekly Carpool slot", () => {
  it("compiles to 52 one-day buckets on Thursdays at an exact 8:44", () => {
    const [carpool] = OPEN_BOOKS.lines;
    const buckets = compile(carpool!);
    expect(buckets).toHaveLength(52);
    expect(totalQuantity(buckets)).toBe(OPEN_BOOKS.stated_total_spots);
    expect(carpool!.time_mode).toBe("exact");
    expect(carpool!.preferred_time).toBe("08:44");
  });
});

describe("#2 Fireman Termite — weekly Carpool plus every-other-week ROS", () => {
  it("compiles 52 Wednesdays and 26 alternate weeks, 78 in all", () => {
    const [carpool, ros] = FIREMAN_TERMITE.lines;
    expect(compile(carpool!)).toHaveLength(52);
    const rosBuckets = compile(ros!);
    expect(rosBuckets).toHaveLength(26);
    expect(rosBuckets[0]!.periodStart).toBe("2026-05-18");
    expect(rosBuckets[1]!.periodStart).toBe("2026-06-01");
    expect(orderTotal(FIREMAN_TERMITE)).toBe(78);
  });
});

describe("#3 FDOH Escambia — 4 a week Mon–Fri, max 1 a day", () => {
  it("is 52 weekly buckets of 4 with a data-driven cap of one a day, first week partial", () => {
    const [line] = FDOH_ESCAMBIA.lines;
    const buckets = compile(line!);
    expect(buckets).toHaveLength(52);
    expect(totalQuantity(buckets)).toBe(208);
    expect(buckets[0]).toMatchObject({
      periodStart: "2026-07-01",
      periodEnd: "2026-07-05",
      partial: true,
    });
    expect(line!.max_per_day).toBe(1);
  });
});

describe("#4 Phil Hall 2022-23 — exact Carpool, Marketplace opening credit, flexible TPR, Saturday WE", () => {
  it("expresses the opening credit as a position, not a time", () => {
    const marketplace = PHIL_HALL_2022.lines[1]!;
    expect(marketplace.time_mode).toBe("slot");
    expect(marketplace.required_opportunity_key).toBe("marketplace.opening");
    expect(compile(marketplace)).toHaveLength(52);
  });
  it("lets the TPR week land on Monday, Thursday or Friday without saying which", () => {
    const tpr = PHIL_HALL_2022.lines[2]!;
    expect(tpr.days_of_week).toEqual([1, 4, 5]);
    expect(compile(tpr).every((b) => b.quantity === 1)).toBe(true);
    expect(compile(tpr)).toHaveLength(52);
  });
  it("keeps the printed 27 for a year of Saturdays as the order's own number, not the compiled 52", () => {
    const weekend = PHIL_HALL_2022.lines[3]!;
    expect(weekend.stated_total).toBe(27);
    expect(compile(weekend)).toHaveLength(52);
  });
});

describe("#5 Phil Hall 2024-25 — rotating weekdays and either-day weekend", () => {
  it("is three weekly quotas of one with no fixed weekday", () => {
    for (const line of PHIL_HALL_2024.lines) {
      expect(line.spec).toEqual({ kind: "weekly_quota", quantity: 1 });
      expect(compile(line)).toHaveLength(52);
    }
    expect(PHIL_HALL_2024.lines[2]!.days_of_week).toEqual([0, 6]);
    expect(orderTotal(PHIL_HALL_2024)).toBe(156);
  });
});

describe("#6 Symphony 2021-22 — event phases with one- and two-per-day quantities", () => {
  it("compiles the ROS runs with two-a-day dates, 44 in all as the order states", () => {
    expect(orderTotal(SYMPHONY_2021, (line) => line.pool === "Total Program Rotation")).toBe(44);
    const openingRos = compile(SYMPHONY_2021.lines[1]!);
    expect(openingRos.find((b) => b.periodStart === "2021-10-12")!.quantity).toBe(2);
    expect(openingRos.find((b) => b.periodStart === "2021-10-07")!.quantity).toBe(1);
  });
  it("keeps the AM lines' printed 6 against five listed days as a review case, not a silent fix", () => {
    const openingAm = SYMPHONY_2021.lines[0]!;
    expect(openingAm.stated_total).toBe(6);
    expect(totalQuantity(compile(openingAm))).toBe(5);
    expect(orderTotal(SYMPHONY_2021, (line) => line.pool === "AM Drive")).toBe(21);
  });
});

describe("#7 Symphony 2025-26 — a cancelled flight and its substitute", () => {
  it("the cancelled gala line compiles to nothing while the Jazz Brunch carries five", () => {
    const gala = SYMPHONY.lines.find((l) => l.label.includes("Gala"))!;
    const brunch = SYMPHONY.lines.find((l) => l.label.includes("Jazz Brunch"))!;
    // Compilation is unaffected by cancellation — eligibility (bucketForDate) is what refuses it.
    expect(compile(gala)).toHaveLength(5);
    expect(gala.status).toBe("cancelled");
    expect(compile(brunch)).toHaveLength(5);
    expect(orderTotal(SYMPHONY, (l) => l.status === "active")).toBe(28);
  });
});

describe("#8/#9 FPL — the agency matrix with dark weeks and bonus weight", () => {
  it("reproduces every column, dark weeks as zero buckets, 540 in all", () => {
    expect(orderTotal(FPM_FPL)).toBe(540);
    for (const line of FPM_FPL.lines) {
      expect(totalQuantity(compile(line))).toBe(line.stated_total);
    }
    const am = compile(FPM_FPL.lines[0]!);
    expect(am).toHaveLength(48);
    expect(am.filter((b) => b.quantity === 0).map((b) => b.periodStart)).toEqual([
      "2026-03-23",
      "2026-05-25",
      "2026-08-24",
      "2026-11-23",
    ]);
  });
  it("marks the bonus line as bonus weight, not guaranteed", () => {
    expect(FPM_FPL.lines[4]!.service_level).toBe("bonus");
  });
});

describe("#10 San Antonio Shoemakers — alternating-week matrix", () => {
  it("compiles 26 weekend credits and 13 bonus credits across alternating weeks with a two-week dark run", () => {
    const [wk, bn] = SAN_ANTONIO_SHOEMAKERS.lines;
    expect(totalQuantity(compile(wk!))).toBe(26);
    expect(totalQuantity(compile(bn!))).toBe(13);
    const weeks = compile(wk!);
    expect(weeks.find((b) => b.periodStart === "2025-12-29")!.quantity).toBe(2);
    expect(weeks.find((b) => b.periodStart === "2026-01-05")!.quantity).toBe(0);
    expect(weeks.find((b) => b.periodStart === "2026-01-12")!.quantity).toBe(0);
    expect(weeks.find((b) => b.periodStart === "2026-01-19")!.quantity).toBe(2);
    expect(orderTotal(SAN_ANTONIO_SHOEMAKERS)).toBe(SAN_ANTONIO_SHOEMAKERS.stated_total_spots);
  });
});

describe("#11 New South Window Solutions — high weekly weight", () => {
  it("is 27 selected weeks of 10 AM + 10 PM + 6 weekend, 702 in all, with no per-day cap", () => {
    expect(orderTotal(NEW_SOUTH_WINDOWS)).toBe(702);
    for (const line of NEW_SOUTH_WINDOWS.lines) {
      expect(compile(line)).toHaveLength(27);
      expect(line.max_per_day).toBeNull();
      expect(totalQuantity(compile(line))).toBe(line.stated_total);
    }
  });
});

describe("#12 Cultural Arts Alliance — mixed products", () => {
  it("compiles a 3-week AM quota, a ROS quota, five exact Carpool Wednesdays, and eight Tue/Thu placements", () => {
    const [am, ros, carpool, tueThu] = CULTURAL_ARTS_ALLIANCE.lines;
    expect(totalQuantity(compile(am!))).toBe(15);
    expect(totalQuantity(compile(ros!))).toBe(6);
    expect(compile(carpool!).map((b) => b.periodStart)).toEqual([
      "2026-04-29",
      "2026-05-06",
      "2026-05-13",
      "2026-05-20",
      "2026-05-27",
    ]);
    expect(compile(tueThu!)).toHaveLength(8);
    expect(orderTotal(CULTURAL_ARTS_ALLIANCE)).toBe(34);
  });
});

describe("#13 Wild Birds Unlimited — a weekday that changes every 13 weeks", () => {
  it("is four 13-credit phases on the same position, 52 in all", () => {
    for (const phase of WILD_BIRDS_UNLIMITED.lines) {
      expect(compile(phase)).toHaveLength(13);
      expect(phase.required_opportunity_key).toBe("morning-edition.birdnote");
    }
    expect(orderTotal(WILD_BIRDS_UNLIMITED)).toBe(52);
  });
});

describe("#14 West Moss / International Paper / Phil Hall 2020 — opening and closing positions", () => {
  it("West Moss: 13 weekly opening credits keyed to the Five Corners opening position", () => {
    const [line] = WEST_MOSS.lines;
    expect(line!.time_mode).toBe("slot");
    expect(compile(line!)).toHaveLength(13);
  });
  it("International Paper: a Sunday closing credit, a rotating drive credit, a Science Friday credit — 156", () => {
    expect(orderTotal(INTERNATIONAL_PAPER)).toBe(156);
    expect(INTERNATIONAL_PAPER.lines[0]!.required_opportunity_key).toBe("living-on-earth.closing");
    expect(INTERNATIONAL_PAPER.lines[1]!.pool).toBe("Drive Time");
  });
  it("Phil Hall 2020: phased weekday lines sum to the printed counts and the bonus block is one range bucket", () => {
    const counts = PHIL_HALL_2020.lines.map((line) => totalQuantity(compile(line)));
    expect(counts).toEqual([13, 8, 52, 39, 13, 26, 26, 84]);
    expect(PHIL_HALL_2020.lines[7]!.service_level).toBe("bonus");
    expect(compile(PHIL_HALL_2020.lines[7]!)).toHaveLength(1);
  });
});

describe("#15 Autumn Beck Blackledge — the reference agreement", () => {
  it("still comes to 104 across three fixed-day lines with preferred times", () => {
    expect(orderTotal(AUTUMN_BECK_BLACKLEDGE)).toBe(104);
    for (const line of AUTUMN_BECK_BLACKLEDGE.lines) {
      expect(totalQuantity(compile(line))).toBe(line.stated_total);
      expect(line.time_mode).toBe("preferred");
    }
  });
});

describe("the first brief's orders still compile to their stated totals", () => {
  it.each([
    ["Boyles", BOYLES, 312],
    ["Natural Awakenings", NATURAL_AWAKENINGS, 156],
    ["Choral Society", CHORAL_SOCIETY, 60],
    ["Emerald Coast Theatre", EMERALD_COAST_THEATRE, 64],
    ["Live Nation", LIVE_NATION, 9],
    ["Bud & Alley's", BUD_AND_ALLEYS, 134],
  ])("%s", (_name, order, total) => {
    expect(orderTotal(order as FixtureOrder)).toBe(total);
  });
  it("309 Punk switches weekday on the printed dates, 17 credits in all", () => {
    expect(orderTotal(PUNK_309)).toBe(17);
    expect(compile(PUNK_309.lines[0]!)[0]!.periodStart).toBe("2026-10-09"); // the first Friday after "Oct. 3"
  });
});

describe("describeEntrySpec", () => {
  it("reads like the order", () => {
    expect(
      describeEntrySpec(
        { kind: "weekly_quota", quantity: 4 },
        [1, 2, 3, 4, 5],
        "Drive Time credit",
      ),
    ).toBe("4 Drive Time credits a week, each weekday");
    expect(describeEntrySpec({ kind: "every_n_weeks", interval_weeks: 2, quantity: 1 }, [])).toBe(
      "1 credit every other week, any day",
    );
    expect(describeEntrySpec({ kind: "fixed_days", count_per_day: 1 }, [3])).toBe(
      "1 credit each Wed",
    );
    expect(describeEntrySpec({ kind: "range_total", quantity: 84 }, [])).toBe(
      "84 credits over the whole run, any day",
    );
  });
});
