import { describe, expect, it } from "vitest";
import {
  countByShow,
  filterSources,
  parseSourceShow,
  parseSourceSort,
  type SourceListRow,
} from "./source-list";

const row = (over: Partial<SourceListRow> & { id: string }): SourceListRow => ({
  title: over.id,
  date: "2026-10-01",
  status: "ready",
  analysis: { kind: "done", total: 3, toReview: 0 },
  ...over,
});

const rows: SourceListRow[] = [
  row({ id: "Carla", date: "2026-10-03" }),
  row({ id: "Ed", date: "2026-10-03", analysis: { kind: "idle" } }),
  row({ id: "Plan", date: "2026-09-29", analysis: { kind: "failed", error: null } }),
  row({ id: "Ruth", date: "2026-09-26", status: "failed", analysis: { kind: "source_failed" } }),
  row({ id: "Mike", date: "2026-09-22", status: "processing", analysis: null }),
];

describe("parse", () => {
  it("falls back to the defaults", () => {
    expect(parseSourceShow("nonsense")).toBe("all");
    expect(parseSourceShow("attention")).toBe("attention");
    expect(parseSourceSort(undefined)).toBe("date");
    expect(parseSourceSort("title")).toBe("title");
  });
});

describe("countByShow", () => {
  it("counts each filter", () => {
    expect(countByShow(rows)).toEqual({ all: 5, not_analyzed: 2, attention: 2 });
  });
});

describe("filterSources", () => {
  it("sorts newest first, then by title", () => {
    const out = filterSources(rows, { query: "", show: "all", sort: "date" });
    expect(out.map((r) => r.id)).toEqual(["Carla", "Ed", "Plan", "Ruth", "Mike"]);
  });

  it("sorts by title", () => {
    const out = filterSources(rows, { query: "", show: "all", sort: "title" });
    expect(out.map((r) => r.id)).toEqual(["Carla", "Ed", "Mike", "Plan", "Ruth"]);
  });

  it("filters to what needs attention", () => {
    const out = filterSources(rows, { query: "", show: "attention", sort: "date" });
    expect(out.map((r) => r.id)).toEqual(["Plan", "Ruth"]);
  });

  it("filters to ready sources that were never analyzed", () => {
    const out = filterSources(rows, { query: "", show: "not_analyzed", sort: "date" });
    expect(out.map((r) => r.id)).toEqual(["Ed", "Plan"]);
  });

  it("matches titles regardless of case", () => {
    const out = filterSources(rows, { query: " CARL ", show: "all", sort: "date" });
    expect(out.map((r) => r.id)).toEqual(["Carla"]);
  });
});
