import { describe, expect, it } from "vitest";
import {
  appliedFilterLabels,
  filtersFitInline,
  INLINE_FILTER_CHIP_LIMIT,
  type FilterGroup,
} from "./filter-groups";

function group(label: string, labels: string[], active = 0): FilterGroup {
  return {
    label,
    chips: labels.map((chip, index) => ({
      label: chip,
      href: `?${index}`,
      active: index === active,
    })),
  };
}

describe("filtersFitInline", () => {
  it("keeps one short group inline", () => {
    expect(filtersFitInline([group("Status", ["All", "Open", "Closed"])])).toBe(true);
  });

  it("moves a long group behind the button", () => {
    const labels = Array.from({ length: INLINE_FILTER_CHIP_LIMIT + 1 }, (_, i) => `T${i}`);
    expect(filtersFitInline([group("Type", labels)])).toBe(false);
  });

  it("moves two groups behind the button, however short", () => {
    expect(filtersFitInline([group("Status", ["All", "A"]), group("Type", ["All", "B"])])).toBe(
      false,
    );
  });

  it("has nothing to show inline with no groups", () => {
    expect(filtersFitInline([])).toBe(false);
  });
});

describe("appliedFilterLabels", () => {
  it("is empty while every group is on its reset", () => {
    expect(
      appliedFilterLabels([group("Status", ["All", "Open"]), group("Type", ["All", "X"])]),
    ).toEqual([]);
  });

  it("names each applied group's active chip, in group order", () => {
    expect(
      appliedFilterLabels([
        group("Status", ["All", "Open"], 1),
        group("Type", ["All", "Promo"], 1),
      ]),
    ).toEqual(["Open", "Promo"]);
  });

  it("ignores a group with nothing active", () => {
    expect(appliedFilterLabels([group("Status", ["All", "Open"], -1)])).toEqual([]);
  });
});
