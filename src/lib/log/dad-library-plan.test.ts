import { describe, expect, it } from "vitest";
import {
  buildDadLibraryPlan,
  describeScheduleTiming,
  matchProgramForPromo,
  type DadLibraryPlanInputs,
  type PlanScheduleEntry,
} from "./dad-library-plan";
import type { DadLibraryCut } from "./dad-library-import";
import type { PlanProgram } from "./program-log-plan";

const PROGRAMS: PlanProgram[] = [
  { id: "p-1a", name: "1A" },
  { id: "p-atc", name: "All Things Considered" },
  { id: "p-scifri", name: "Science Friday" },
  { id: "p-wcafe", name: "World Cafe" },
  { id: "p-wesat", name: "Weekend Edition Saturday" },
];

function cut(cutNumber: string, title: string, lengthSeconds: number, group: string): DadLibraryCut {
  return { cutNumber, title, lengthSeconds, group };
}

describe("matchProgramForPromo", () => {
  it("matches a title that already contains the program's full name", () => {
    expect(matchProgramForPromo("Fresh Air Wed Aug 26", [{ id: "p", name: "Fresh Air" }])?.name).toBe(
      "Fresh Air",
    );
  });

  it("falls back to a curated abbreviation prefix", () => {
    expect(matchProgramForPromo("atc 1", PROGRAMS)?.name).toBe("All Things Considered");
    expect(matchProgramForPromo("Sci Fri Gen 1", PROGRAMS)?.name).toBe("Science Friday");
    expect(matchProgramForPromo("1A Wed Aug 26", PROGRAMS)?.name).toBe("1A");
  });

  it("distinguishes a qualified abbreviation from the bare, ambiguous one", () => {
    expect(matchProgramForPromo("We Sat 1", PROGRAMS)?.name).toBe("Weekend Edition Saturday");
    expect(matchProgramForPromo("Weekend Edition 1", PROGRAMS)).toBeNull();
  });

  it("returns null for a title with no real Log program", () => {
    expect(matchProgramForPromo("Thistle 1", PROGRAMS)).toBeNull();
    expect(matchProgramForPromo("Smart Speaker 1", PROGRAMS)).toBeNull();
  });
});

describe("describeScheduleTiming", () => {
  it("names the day for a single-day entry", () => {
    const entry: PlanScheduleEntry = { program_id: "p", entry_type: "recurring", days_of_week: [5], air_time: "13:00:00" };
    expect(describeScheduleTiming(entry)).toBe("Friday afternoon at 1:00 PM");
  });

  it("phrases a weekday-recurring entry generically", () => {
    const entry: PlanScheduleEntry = {
      program_id: "p",
      entry_type: "recurring",
      days_of_week: [1, 2, 3, 4, 5],
      air_time: "19:00:00",
    };
    expect(describeScheduleTiming(entry)).toBe("weekday evenings at 7:00 PM");
  });

  it("phrases a weekend entry generically", () => {
    const entry: PlanScheduleEntry = { program_id: "p", entry_type: "recurring", days_of_week: [0, 6], air_time: "07:00:00" };
    expect(describeScheduleTiming(entry)).toBe("weekend mornings at 7:00 AM");
  });

  it("phrases an every-day entry", () => {
    const entry: PlanScheduleEntry = {
      program_id: "p",
      entry_type: "recurring",
      days_of_week: [0, 1, 2, 3, 4, 5, 6],
      air_time: "00:00:00",
    };
    expect(describeScheduleTiming(entry)).toBe("every day night at 12:00 AM");
  });
});

describe("buildDadLibraryPlan", () => {
  const baseInputs: DadLibraryPlanInputs = {
    cuts: [],
    groups: [],
    programs: PROGRAMS,
    scheduleEntries: [
      { program_id: "p-scifri", entry_type: "recurring", days_of_week: [5], air_time: "13:00:00" },
    ],
    existingItems: [],
  };

  it("routes a direct-mapped group's cuts to their content type", () => {
    const plan = buildDadLibraryPlan({
      ...baseInputs,
      cuts: [cut("00001", "UF-Parks-Museums-1", 90, "UNEARTH"), cut("00005", "Some PSA", 60, "PPA")],
    });
    expect(plan.directItems).toEqual([
      expect.objectContaining({ cutNumber: "00001", contentType: "interview_feature", unmatchedProgramPromo: false }),
      expect.objectContaining({ cutNumber: "00005", contentType: "psa", unmatchedProgramPromo: false }),
    ]);
    expect(plan.groupSummaries).toContainEqual({
      group: "UNEARTH",
      cutCount: 1,
      treatment: "direct",
      contentType: "interview_feature",
    });
  });

  it("skips a skip-listed group entirely", () => {
    const plan = buildDadLibraryPlan({ ...baseInputs, cuts: [cut("00002", "Test tone", 5, "TEST")] });
    expect(plan.directItems).toEqual([]);
    expect(plan.groupSummaries).toEqual([{ group: "TEST", cutCount: 1, treatment: "skip", contentType: null }]);
  });

  it("warns on a group it has never seen, and skips it", () => {
    const plan = buildDadLibraryPlan({ ...baseInputs, cuts: [cut("00099", "Mystery cut", 30, "MYSTERY")] });
    expect(plan.groupSummaries).toEqual([{ group: "MYSTERY", cutCount: 1, treatment: "unknown", contentType: null }]);
    expect(plan.warnings.some((warning) => warning.includes("MYSTERY"))).toBe(true);
  });

  it("collapses matched GENERIC/DAILY/WEEKLY cuts into one canonical promo per program", () => {
    const plan = buildDadLibraryPlan({
      ...baseInputs,
      cuts: [
        cut("20090", "Sci Fri Gen 1", 29, "GENERIC"),
        cut("20117", "Sci Fri Gen 2", 29, "GENERIC"),
        cut("00061", "Sci Fri This Week", 30, "WEEKLY"),
      ],
    });
    expect(plan.directItems).toEqual([]);
    expect(plan.synthesizedPromos).toHaveLength(1);
    const promo = plan.synthesizedPromos[0]!;
    expect(promo.programName).toBe("Science Friday");
    expect(promo.sourceCutCount).toBe(3);
    expect(promo.dadGroup).toBe("GENERIC, WEEKLY");
    expect(promo.expectedDurationSeconds).toBe(30);
    expect(promo.tagScript).toBe("Join us for Science Friday, Friday afternoon at 1:00 PM.");
    expect(promo.representativeCutNumber).toBe("00061");
  });

  it("falls an unmatched collapse-group cut back to a plain station_promo item", () => {
    const plan = buildDadLibraryPlan({
      ...baseInputs,
      cuts: [cut("20228", "Smart Speaker 1", 28, "GENERIC")],
    });
    expect(plan.synthesizedPromos).toEqual([]);
    expect(plan.directItems).toEqual([
      expect.objectContaining({ cutNumber: "20228", contentType: "station_promo", unmatchedProgramPromo: true }),
    ]);
  });

  it("reuses an existing item's id when the cart number was already imported", () => {
    const plan = buildDadLibraryPlan({
      ...baseInputs,
      cuts: [cut("00001", "UF-Parks-Museums-1", 90, "UNEARTH")],
      existingItems: [{ id: "existing-id", dad_cart_number: "00001" }],
    });
    expect(plan.directItems[0]!.existingItemId).toBe("existing-id");
  });
});
