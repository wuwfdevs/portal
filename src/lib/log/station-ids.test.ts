import { describe, expect, it } from "vitest";
import {
  describeGap,
  stationIdCoverage,
  type StationIdPin,
  type StationIdPosition,
} from "./station-ids";

const position: StationIdPosition = {
  opportunityId: "op",
  label: "Music Bed",
  startOffsetSeconds: 3590,
  requirement: "required",
};

function pin(overrides: Partial<StationIdPin>): StationIdPin {
  return {
    id: "p",
    opportunityId: "op",
    contentTitle: "Legal ID",
    hourIndex: null,
    daysOfWeek: [],
    ...overrides,
  };
}

describe("stationIdCoverage", () => {
  it("needs an ID position on the clock", () => {
    expect(stationIdCoverage({ shiftHours: 2, airDays: [1], positions: [], pins: [] }).status).toBe(
      "no_position",
    );
  });

  it("is covered by one pin for every hour and day", () => {
    expect(
      stationIdCoverage({ shiftHours: 4, airDays: [1, 2], positions: [position], pins: [pin({})] }),
    ).toEqual({ status: "covered", gaps: [] });
  });

  it("names every hour when nothing is pinned", () => {
    const result = stationIdCoverage({
      shiftHours: 2,
      airDays: [1],
      positions: [position],
      pins: [],
    });
    expect(result.status).toBe("not_pinned");
    expect(result.gaps.map(describeGap)).toEqual(["Hour 1", "Hour 2"]);
  });

  it("finds the hours and days a partial set of pins leaves open", () => {
    const result = stationIdCoverage({
      shiftHours: 2,
      airDays: [0, 1, 2, 3, 4, 5, 6],
      positions: [position],
      pins: [pin({ hourIndex: 0 }), pin({ hourIndex: 1, daysOfWeek: [1, 2, 3, 4, 5] })],
    });
    expect(result.status).toBe("partial");
    expect(result.gaps.map(describeGap)).toEqual(["Hour 2 (Sun, Sat)"]);
  });

  it("only asks about the days the clock airs", () => {
    expect(
      stationIdCoverage({
        shiftHours: 1,
        airDays: [6, 0],
        positions: [position],
        pins: [pin({ daysOfWeek: [0, 6] })],
      }).status,
    ).toBe("covered");
  });

  it("ignores pins on positions that aren't ID positions", () => {
    expect(
      stationIdCoverage({
        shiftHours: 1,
        airDays: [1],
        positions: [position],
        pins: [pin({ opportunityId: "other" })],
      }).status,
    ).toBe("not_pinned");
  });
});
