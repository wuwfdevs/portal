import { describe, expect, it } from "vitest";
import { formatEventTime, readSiteOrigin, stationInputToUTC, utcToStationInput } from "./event-times";

describe("event times", () => {
  it("reads a typed time in the station's zone, not the server's", () => {
    // Central Standard Time in December is UTC-6.
    expect(stationInputToUTC("2026-12-05T18:00")).toBe("2026-12-06T00:00:00.000Z");
    // Central Daylight Time in July is UTC-5.
    expect(stationInputToUTC("2026-07-04T18:00")).toBe("2026-07-04T23:00:00.000Z");
  });
  it("round-trips through the input value", () => {
    for (const value of ["2026-12-05T18:00", "2026-07-04T09:30", "2026-11-01T00:15"]) {
      expect(utcToStationInput(stationInputToUTC(value))).toBe(value);
    }
  });
  it("answers nothing for what is not a date and time", () => {
    expect(stationInputToUTC("tomorrow")).toBeNull();
    expect(stationInputToUTC("")).toBeNull();
    expect(utcToStationInput(null)).toBe("");
    expect(utcToStationInput("nope")).toBe("");
  });
});

describe("formatEventTime", () => {
  it("reads in the station's zone with the zone named", () => {
    expect(formatEventTime("2026-12-06T00:00:00.000Z")).toBe("Sat, Dec 5, 6:00 PM CST");
  });
});

describe("readSiteOrigin", () => {
  it("accepts an https origin and normalizes it", () => {
    expect(readSiteOrigin(" https://www.example.org/ ")).toEqual({ ok: true, origin: "https://www.example.org" });
    expect(readSiteOrigin("http://localhost:3000")).toEqual({ ok: true, origin: "http://localhost:3000" });
  });
  it("refuses what could send a card somewhere else", () => {
    for (const bad of [undefined, "", "not a url", "http://www.example.org", "https://user:pw@example.org", "https://example.org/x", "https://example.org/?a=1"]) {
      expect(readSiteOrigin(bad).ok).toBe(false);
    }
  });
});
