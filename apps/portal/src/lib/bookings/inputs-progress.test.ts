import { describe, expect, it } from "vitest";
import { buildInputsRows, progressLabel } from "./inputs-progress";
import { INPUT_SECTIONS, ratesHref, ratesTabFor } from "./paths";

const pending = { validationState: "pending" as const };
const done = { validationState: "accepted_as_is" as const };

describe("buildInputsRows", () => {
  it("counts pending rows per editor and links each with the version", () => {
    const rows = buildInputsRows("v1", {
      assumptions: [pending, done, done],
      labor: [done],
      pools: [],
      packages: 4,
    });
    expect(rows.map((row) => [row.section, row.pending, row.total])).toEqual([
      ["assumptions", 1, 3],
      ["labor", 0, 1],
      ["pools", 0, 0],
      ["packages", null, 4],
    ]);
    expect(rows[0]?.href).toBe("/bookings/rates/assumptions?version=v1");
  });
});

describe("progressLabel", () => {
  it("reads naturally in each state", () => {
    expect(progressLabel({ section: "labor", pending: 1, total: 3 })).toBe("2 of 3 validated");
    expect(progressLabel({ section: "labor", pending: 0, total: 3 })).toBe("All 3 validated");
    expect(progressLabel({ section: "pools", pending: 0, total: 0 })).toBe("Nothing yet");
    expect(progressLabel({ section: "packages", pending: null, total: 1 })).toBe("1 package");
  });
});

describe("ratesTabFor", () => {
  it("lights Inputs for every editor and keeps the catalogs off the tab row", () => {
    for (const section of INPUT_SECTIONS) expect(ratesTabFor(section)).toBe("inputs");
    expect(ratesTabFor("card")).toBe("card");
    expect(ratesTabFor("changes")).toBe("history");
    expect(ratesTabFor("assets")).toBeNull();
    expect(ratesTabFor("setup")).toBeNull();
  });
  it("puts the Assumptions editor under its own path", () => {
    expect(ratesHref("assumptions", "v1")).toBe("/bookings/rates/assumptions?version=v1");
  });
});
