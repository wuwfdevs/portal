import { describe, expect, it } from "vitest";
import {
  DATA_SOURCES,
  deriveDataSourceState,
  formatStaleAfter,
  isDataSourcesPath,
} from "./data-sources";

const NOW = "2026-09-29T12:00:00.000Z";
const THIRTY_MINUTES = 30 * 60_000;

function state(overrides: Partial<Parameters<typeof deriveDataSourceState>[0]>) {
  return deriveDataSourceState({
    configured: true,
    lastUpdatedAt: "2026-09-29T11:50:00.000Z",
    staleAfterMs: THIRTY_MINUTES,
    refreshFailed: false,
    nowISO: NOW,
    ...overrides,
  });
}

describe("deriveDataSourceState", () => {
  it("is fresh inside the source's own window", () => {
    expect(state({})).toBe("fresh");
  });

  it("is stale once the window has passed", () => {
    expect(state({ lastUpdatedAt: "2026-09-29T11:30:00.000Z" })).toBe("stale");
  });

  it("is stale when a refresh failed, even if the saved copy is recent", () => {
    expect(state({ refreshFailed: true })).toBe("stale");
  });

  it("has never been fetched when nothing was ever saved", () => {
    expect(state({ lastUpdatedAt: null, refreshFailed: true })).toBe("never_fetched");
  });

  it("reports not configured before anything else", () => {
    expect(state({ configured: false, lastUpdatedAt: null })).toBe("not_configured");
    expect(state({ configured: false })).toBe("not_configured");
  });
});

describe("formatStaleAfter", () => {
  it("reads in minutes under an hour and whole hours above", () => {
    expect(formatStaleAfter(15 * 60_000)).toBe("15 minutes");
    expect(formatStaleAfter(60_000)).toBe("1 minute");
    expect(formatStaleAfter(60 * 60_000)).toBe("1 hour");
    expect(formatStaleAfter(120 * 60_000)).toBe("2 hours");
    expect(formatStaleAfter(90 * 60_000)).toBe("90 minutes");
  });
});

describe("DATA_SOURCES", () => {
  it("gives every source a unique key and a page under /log/sources", () => {
    const keys = DATA_SOURCES.map((source) => source.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const source of DATA_SOURCES) expect(isDataSourcesPath(source.href)).toBe(true);
  });
});

describe("isDataSourcesPath", () => {
  it("covers the overview and each source's page, nothing else", () => {
    expect(isDataSourcesPath("/log/sources")).toBe(true);
    expect(isDataSourcesPath("/log/sources/npr")).toBe(true);
    expect(isDataSourcesPath("/log/sourcesx")).toBe(false);
    expect(isDataSourcesPath("/log/npr")).toBe(false);
  });
});
