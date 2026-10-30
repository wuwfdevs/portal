import { describe, expect, it } from "vitest";
import {
  assumedFor,
  assumedVersusObserved,
  plannedFigures,
  type ObservedLine,
  type ObservedProject,
} from "./observed";

function line(overrides: Partial<ObservedLine> = {}): ObservedLine {
  return {
    kind: "package",
    package_id: "webcast",
    label: "Basic event webcast (event)",
    quantity: 1,
    labor_hours: { lead: 5, student: 10 },
    resource_units: { live: 1, webcast: 1 },
    recipe_labor_hours: { lead: 5, student: 10 },
    recipe_resource_units: { live: 1, webcast: 1 },
    ...overrides,
  };
}

function project(overrides: Partial<ObservedProject> & { id: string }): ObservedProject {
  return { lines: [line()], confirmed: [], ...overrides };
}

describe("assumedFor and plannedFigures", () => {
  it("assumes the standard recipe, however the project's scope was adjusted", () => {
    const adjusted = line({ quantity: 2, labor_hours: { lead: 9, student: 10 } });
    expect(assumedFor([adjusted]).labor).toEqual({ lead: 10, student: 20 });
    expect(plannedFigures([adjusted]).labor).toEqual({ lead: 18, student: 20 });
  });
  it("ignores labor and expense lines, which have no recipe", () => {
    expect(
      assumedFor([line({ kind: "labor", package_id: null, recipe_labor_hours: null, recipe_resource_units: null })]),
    ).toEqual({ labor: {}, resources: {} });
  });
});

describe("assumedVersusObserved", () => {
  const delivered = project({
    id: "a",
    confirmed: [
      { kind: "labor", id: "lead", planned: 5, used: 7 },
      { kind: "labor", id: "student", planned: 10, used: 8 },
      { kind: "units", id: "live", planned: 1, used: 1 },
      { kind: "units", id: "webcast", planned: 1, used: 0.5 },
    ],
  });
  const second = project({
    id: "b",
    confirmed: [
      { kind: "labor", id: "lead", planned: 5, used: 6 },
      { kind: "labor", id: "student", planned: 10, used: 10 },
    ],
  });
  const unconfirmed = project({ id: "c" });

  it("sets assumed hours against confirmed hours per class, over confirmed projects only", () => {
    const result = assumedVersusObserved([delivered, second, unconfirmed], []);
    expect(result.confirmedProjects).toBe(2);
    expect(result.labor).toEqual([
      { classId: "lead", assumed: 10, confirmed: 13, projects: 2 },
      { classId: "student", assumed: 20, confirmed: 18, projects: 2 },
    ]);
  });

  it("sets units planned against units used per resource", () => {
    const result = assumedVersusObserved([delivered, second], []);
    expect(result.resources).toEqual([
      { poolId: "live", planned: 1, used: 1, projects: 1 },
      { poolId: "webcast", planned: 1, used: 0.5, projects: 1 },
    ]);
  });

  it("attributes hours to a package only for a project that had only that package", () => {
    const two = project({
      id: "d",
      lines: [line(), line({ package_id: "studio", label: "Studio access" })],
      confirmed: [{ kind: "labor", id: "lead", planned: 6, used: 9 }],
    });
    const result = assumedVersusObserved([delivered, two], []);
    expect(result.packages).toEqual([
      { packageId: "webcast", label: "Basic event webcast (event)", assumed: 15, confirmed: 15, projects: 1 },
    ]);
  });

  it("counts refused and released bookings by resource, busiest first", () => {
    const result = assumedVersusObserved([], [
      { pool_id: "studio", kind: "refused" },
      { pool_id: "studio", kind: "refused" },
      { pool_id: "studio", kind: "released" },
      { pool_id: "live", kind: "released" },
      { pool_id: null, kind: "refused" },
    ]);
    expect(result.events).toEqual([
      { poolId: "studio", refused: 2, released: 1 },
      { poolId: "live", refused: 0, released: 1 },
      { poolId: null, refused: 1, released: 0 },
    ]);
    expect(result.confirmedProjects).toBe(0);
  });
});
