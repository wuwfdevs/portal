import { describe, expect, it } from "vitest";
import {
  countPlacementsByFilter,
  filterPlacements,
  groupPlacementsByWeek,
  parsePlacementListFilter,
} from "./placement-list";

describe("parsePlacementListFilter", () => {
  it("defaults to upcoming", () => {
    expect(parsePlacementListFilter(undefined)).toBe("upcoming");
    expect(parsePlacementListFilter("bogus")).toBe("upcoming");
  });
  it("accepts aired and not_aired", () => {
    expect(parsePlacementListFilter("aired")).toBe("aired");
    expect(parsePlacementListFilter("not_aired")).toBe("not_aired");
  });
});

describe("counting and filtering", () => {
  const items = [
    { id: "a", outcome: "pending" as const },
    { id: "b", outcome: "aired" as const },
    { id: "c", outcome: "aired" as const },
    { id: "d", outcome: "not_aired" as const },
  ];
  it("counts pending as upcoming", () => {
    expect(countPlacementsByFilter(items)).toEqual({ upcoming: 1, aired: 2, not_aired: 1 });
  });
  it("filters by outcome", () => {
    expect(filterPlacements(items, "upcoming").map((i) => i.id)).toEqual(["a"]);
    expect(filterPlacements(items, "aired").map((i) => i.id)).toEqual(["b", "c"]);
    expect(filterPlacements(items, "not_aired").map((i) => i.id)).toEqual(["d"]);
  });
});

describe("groupPlacementsByWeek", () => {
  it("groups by Monday-start week, Sunday closing the week", () => {
    const weeks = groupPlacementsByWeek([
      { placementDate: "2026-09-28" }, // Monday
      { placementDate: "2026-10-04" }, // Sunday, same week
      { placementDate: "2026-10-05" }, // next Monday
    ]);
    expect(weeks.map((w) => [w.weekStart, w.items.length])).toEqual([
      ["2026-09-28", 2],
      ["2026-10-05", 1],
    ]);
  });
  it("returns nothing for no items", () => {
    expect(groupPlacementsByWeek([])).toEqual([]);
  });
});
