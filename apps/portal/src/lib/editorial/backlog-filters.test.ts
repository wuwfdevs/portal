import { describe, expect, it } from "vitest";
import {
  backlogHref,
  buildBacklogFilterGroups,
  matchesBacklogFilters,
  parseBacklogParams,
  type BacklogParams,
} from "./backlog-filters";

const base: BacklogParams = { view: "open", q: "", pillar: "", format: "", urgency: "", page: 1 };

describe("parseBacklogParams", () => {
  it("falls back to the Open view and page 1", () => {
    expect(parseBacklogParams({})).toEqual(base);
    expect(parseBacklogParams({ view: "nope", page: "x" })).toEqual(base);
  });

  it("reads every field and trims the search", () => {
    expect(
      parseBacklogParams({
        view: "stale",
        q: "  beach ",
        pillar: "Military Affairs",
        format: "Audio feature",
        urgency: "Immediate / same day",
        page: "3",
      }),
    ).toEqual({
      view: "stale",
      q: "beach",
      pillar: "Military Affairs",
      format: "Audio feature",
      urgency: "Immediate / same day",
      page: 3,
    });
  });
});

describe("backlogHref", () => {
  it("is the bare path for the defaults", () => {
    expect(backlogHref(base)).toBe("/editorial");
  });

  it("carries the view and filters and never the page", () => {
    expect(backlogHref({ ...base, view: "assigned", pillar: "Power and Politics", page: 4 })).toBe(
      "/editorial?view=assigned&pillar=Power+and+Politics",
    );
  });
});

describe("buildBacklogFilterGroups", () => {
  const groups = buildBacklogFilterGroups(
    { ...base, pillar: "Military Affairs" },
    { open: 14, stale: 3, assigned: 6, archived: 21 },
    { pillars: ["Military Affairs", "Power and Politics"], formats: ["Brief"], urgencies: ["Any"] },
  );

  it("leads with the four views as chips with counts", () => {
    expect(groups[0]?.label).toBe("Status");
    expect(groups[0]?.control).toBeUndefined();
    expect(groups[0]?.chips.map((chip) => [chip.label, chip.count, chip.active])).toEqual([
      ["Open", 14, true],
      ["Stale", 3, false],
      ["Assigned", 6, false],
      ["Archived", 21, false],
    ]);
  });

  it("draws the form filters as selects whose first option resets", () => {
    const pillar = groups[1]!;
    expect(pillar.control).toBe("select");
    expect(pillar.chips[0]).toEqual({ label: "All pillars", href: "/editorial", active: false });
    expect(pillar.chips[1]?.active).toBe(true);
  });

  it("keeps the other filters on every link", () => {
    const format = groups[2]!;
    expect(format.chips[1]?.href).toBe("/editorial?pillar=Military+Affairs&format=Brief");
  });
});

describe("matchesBacklogFilters", () => {
  const row = {
    title: "Beach renourishment funding",
    values: {
      summary: "The county's share is unfunded.",
      primary_pillar: "Growth and Resilience",
      format: "Enterprise feature",
      urgency: "Time-bound / known date",
    },
  };

  it("passes with no filters", () => {
    expect(matchesBacklogFilters(base, row)).toBe(true);
  });

  it("searches the title and every answer, case-insensitively", () => {
    expect(matchesBacklogFilters({ ...base, q: "BEACH" }, row)).toBe(true);
    expect(matchesBacklogFilters({ ...base, q: "unfunded" }, row)).toBe(true);
    expect(matchesBacklogFilters({ ...base, q: "shrimp" }, row)).toBe(false);
  });

  it("matches each form filter exactly", () => {
    expect(matchesBacklogFilters({ ...base, pillar: "Growth and Resilience" }, row)).toBe(true);
    expect(matchesBacklogFilters({ ...base, pillar: "Growth" }, row)).toBe(false);
    expect(matchesBacklogFilters({ ...base, format: "Enterprise feature" }, row)).toBe(true);
    expect(matchesBacklogFilters({ ...base, urgency: "No firm deadline" }, row)).toBe(false);
  });

  it("treats a missing answer as not matching a filter", () => {
    expect(matchesBacklogFilters({ ...base, format: "Brief" }, { title: "x", values: {} })).toBe(
      false,
    );
  });
});
