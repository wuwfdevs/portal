import { describe, expect, it } from "vitest";
import {
  defaultRequestTitle,
  isOfferable,
  packageLineRow,
  parsePackageSelections,
  type PackageLike,
} from "./estimate-lines";

const webcast: PackageLike = {
  id: "pkg",
  name: "Basic event webcast",
  unit_label: "event",
  agreement_id: null,
  active: true,
  labor: [
    { labor_class_id: "lead", hours: 5 },
    { labor_class_id: "student", hours: 10 },
  ],
  resources: [
    { pool_id: "live", units: 1 },
    { pool_id: "webcast", units: 1 },
  ],
};

describe("packageLineRow", () => {
  it("snapshots the package's parts per unit and leaves the rate for pricing", () => {
    expect(packageLineRow(webcast, 2)).toMatchObject({
      kind: "package",
      package_id: "pkg",
      label: "Basic event webcast (event)",
      quantity: 2,
      unit_rate: 0,
      direct_cost: null,
      labor_hours: { lead: 5, student: 10 },
      resource_units: { live: 1, webcast: 1 },
      // The standard recipe the line starts from (§20.6).
      recipe_labor_hours: { lead: 5, student: 10 },
      recipe_resource_units: { live: 1, webcast: 1 },
    });
  });
});

describe("isOfferable", () => {
  it("offers a general package, and a scoped one only under its agreement", () => {
    expect(isOfferable(webcast, null)).toBe(true);
    expect(isOfferable({ ...webcast, agreement_id: "a" }, null)).toBe(false);
    expect(isOfferable({ ...webcast, agreement_id: "a" }, "a")).toBe(true);
    expect(isOfferable({ ...webcast, active: false }, null)).toBe(false);
  });
});

describe("parsePackageSelections", () => {
  it("reads ticked packages with their quantities and ignores the rest", () => {
    expect(
      parsePackageSelections([
        ["pkg_a", "on"],
        ["qty_a", "2"],
        ["qty_b", "5"],
        ["pkg_c", "on"],
        ["title", "x"],
      ]),
    ).toEqual({
      ok: true,
      selections: [
        { packageId: "a", quantity: 2 },
        { packageId: "c", quantity: 1 },
      ],
    });
  });
  it("refuses a nonsense quantity", () => {
    expect(parsePackageSelections([["pkg_a", "on"], ["qty_a", "0"]]).ok).toBe(false);
    expect(parsePackageSelections([["pkg_a", "on"], ["qty_a", "abc"]]).ok).toBe(false);
  });
});

describe("defaultRequestTitle", () => {
  it("names the package and the partner", () => {
    expect(defaultRequestTitle(["Basic event webcast"], "UWF Libraries")).toBe(
      "Basic event webcast for UWF Libraries",
    );
    expect(defaultRequestTitle(["A", "B"], "P")).toBe("A and B for P");
    expect(defaultRequestTitle(["A", "B", "C"], "P")).toBe("A and 2 more for P");
    expect(defaultRequestTitle(["A", "A"], "P")).toBe("A for P");
  });
});
