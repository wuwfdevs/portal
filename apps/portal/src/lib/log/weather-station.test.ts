import { describe, expect, it } from "vitest";
import {
  coverageCountiesProblem,
  formatCoverageCounties,
  parseCoverageCounties,
  statesForCounties,
  weatherLocationFrom,
  weatherUserAgent,
} from "./weather-station";

const WUWF_TEXT = "Escambia:012033\nSanta Rosa:012113\nOkaloosa:012091\nMobile:001097";

describe("parseCoverageCounties", () => {
  it("reads one county per line, in order", () => {
    expect(parseCoverageCounties(WUWF_TEXT)).toEqual([
      { name: "Escambia", same: "012033" },
      { name: "Santa Rosa", same: "012113" },
      { name: "Okaloosa", same: "012091" },
      { name: "Mobile", same: "001097" },
    ]);
  });

  it("skips what is not a county and tolerates blank lines and spacing", () => {
    expect(parseCoverageCounties(" Mobile : 001097 \n\nnot a county\nBaldwin:001003")).toEqual([
      { name: "Mobile", same: "001097" },
      { name: "Baldwin", same: "001003" },
    ]);
  });

  it("is empty for nothing", () => {
    expect(parseCoverageCounties(null)).toEqual([]);
    expect(parseCoverageCounties("")).toEqual([]);
  });

  it("drops spaces around the colon when it formats, so what is stored is what the database accepts", () => {
    expect(formatCoverageCounties(parseCoverageCounties("Mobile : 001097\nBaldwin :001003"))).toBe(
      "Mobile:001097\nBaldwin:001003",
    );
  });

  it("round-trips through the form text", () => {
    expect(formatCoverageCounties(parseCoverageCounties(WUWF_TEXT))).toBe(WUWF_TEXT);
  });
});

describe("coverageCountiesProblem", () => {
  it("accepts a good list and an empty one", () => {
    expect(coverageCountiesProblem(WUWF_TEXT)).toBeNull();
    expect(coverageCountiesProblem("")).toBeNull();
    expect(coverageCountiesProblem("\n \n")).toBeNull();
  });

  it("names the line that is not a county", () => {
    expect(coverageCountiesProblem("Escambia 012033")).toMatch(/"Escambia 012033" is not a county/);
    expect(coverageCountiesProblem("Escambia:12033")).toMatch(/not a county/);
  });

  it("refuses a code whose state is not one", () => {
    expect(coverageCountiesProblem("Nowhere:099001")).toMatch(/099001|not a state code/);
  });

  it("refuses the same county twice", () => {
    expect(coverageCountiesProblem("Escambia:012033\nEscambia again:012033")).toMatch(
      /listed twice/,
    );
  });
});

describe("statesForCounties", () => {
  it("reads the state from each code, once each, in order", () => {
    expect(statesForCounties(parseCoverageCounties(WUWF_TEXT))).toEqual(["FL", "AL"]);
    expect(statesForCounties(parseCoverageCounties("Tulsa:040143\nRogers:040131"))).toEqual(["OK"]);
    expect(statesForCounties([])).toEqual([]);
  });
});

describe("weatherUserAgent", () => {
  it("names the site and a contact, as NWS asks", () => {
    expect(weatherUserAgent("https://tools.wuwf.org", "tools-support@wuwf.org")).toBe(
      "(tools.wuwf.org Log, tools-support@wuwf.org)",
    );
  });

  it("copes with no contact and with no or a malformed site address", () => {
    expect(weatherUserAgent("https://tools.example.org", null)).toBe("(tools.example.org Log)");
    expect(weatherUserAgent(undefined, null)).toBe("(tools portal Log)");
    expect(weatherUserAgent("not a url", "a@b.org")).toBe("(tools portal Log, a@b.org)");
  });
});

describe("weatherLocationFrom", () => {
  const row = {
    latitude: 30.5433,
    longitude: -87.2169,
    alert_counties: WUWF_TEXT,
    primary_city: "Pensacola",
    region: "Florida",
    support_email: "tools-support@wuwf.org",
  };

  it("builds WUWF's location from its row, as the old constants had it", () => {
    const location = weatherLocationFrom(row, { siteUrl: "https://tools.wuwf.org" });
    expect(location).toMatchObject({
      latitude: "30.5433",
      longitude: "-87.2169",
      states: ["FL", "AL"],
      fallbackArea: "Pensacola, Florida",
      userAgent: "(tools.wuwf.org Log, tools-support@wuwf.org)",
    });
    expect(location?.counties.map((county) => county.name)).toEqual([
      "Escambia",
      "Santa Rosa",
      "Okaloosa",
      "Mobile",
    ]);
  });

  it("is null until the studio's coordinates are set, never a default place", () => {
    expect(weatherLocationFrom({ ...row, latitude: null, longitude: null })).toBeNull();
    expect(weatherLocationFrom({ ...row, latitude: 30.5, longitude: null })).toBeNull();
  });

  it("works with no counties: the point query alone", () => {
    const location = weatherLocationFrom({ ...row, alert_counties: null });
    expect(location?.counties).toEqual([]);
    expect(location?.states).toEqual([]);
  });

  it("falls back from the station's support address to the environment's", () => {
    const location = weatherLocationFrom(
      { ...row, support_email: null },
      { siteUrl: "https://t.example.org", supportEmail: "help@example.org" },
    );
    expect(location?.userAgent).toBe("(t.example.org Log, help@example.org)");
  });

  it("names the forecast area from what the station has", () => {
    expect(weatherLocationFrom({ ...row, region: null })?.fallbackArea).toBe("Pensacola");
    expect(weatherLocationFrom({ ...row, primary_city: null, region: null })?.fallbackArea).toBe(
      "the studio's area",
    );
  });
});
