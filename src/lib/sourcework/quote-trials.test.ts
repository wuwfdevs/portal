import { describe, expect, it } from "vitest";
import {
  describeQuoteSide,
  filterQuoteRows,
  groupQuoteSamples,
  matchTrialQuotes,
  parseQuoteTrialResults,
  pickDefaultQuoteSample,
  quoteRowCounts,
  type TrialQuote,
} from "./quote-trials";

function quote(over: Partial<TrialQuote> = {}): TrialQuote {
  return {
    sourceId: "s1",
    sourceTitle: "Tom",
    startMs: 0,
    endMs: 10_000,
    text: "It was pitch black.",
    tier: "strong",
    why: "Concrete.",
    stance: "supports",
    ...over,
  };
}

describe("matchTrialQuotes", () => {
  it("pairs clips on the same stretch of the same source, and lists the rest by side", () => {
    const rows = matchTrialQuotes(
      [quote({ startMs: 0, endMs: 10_000 }), quote({ startMs: 50_000, endMs: 60_000 })],
      [
        quote({ startMs: 2_000, endMs: 11_000, tier: "good" }),
        quote({ startMs: 90_000, endMs: 99_000 }),
      ],
    );
    expect(rows.map((row) => row.group)).toEqual(["both", "live_only", "draft_only"]);
    expect(rows[0]!.draft!.tier).toBe("good");
  });
  it("never pairs clips from different sources", () => {
    const rows = matchTrialQuotes([quote()], [quote({ sourceId: "s2", sourceTitle: "Ann" })]);
    expect(rows.map((row) => row.group).sort()).toEqual(["draft_only", "live_only"]);
  });
  it("pairs one to one, closest first", () => {
    const rows = matchTrialQuotes(
      [quote({ startMs: 0, endMs: 10_000 })],
      [quote({ startMs: 6_000, endMs: 16_000 }), quote({ startMs: 1_000, endMs: 10_000 })],
    );
    const both = rows.find((row) => row.group === "both")!;
    expect(both.draft!.startMs).toBe(1_000);
    expect(rows).toHaveLength(2);
  });
  it("orders rows by source, then time", () => {
    const rows = matchTrialQuotes(
      [quote({ sourceId: "b", sourceTitle: "B", startMs: 5_000, endMs: 9_000 })],
      [quote({ sourceId: "a", sourceTitle: "A", startMs: 90_000, endMs: 99_000 })],
    );
    expect(rows.map((row) => (row.live ?? row.draft)!.sourceTitle)).toEqual(["A", "B"]);
  });
});

describe("counts and filters", () => {
  const rows = matchTrialQuotes([quote()], [quote({ startMs: 70_000, endMs: 80_000 })]);
  it("counts each group", () => {
    expect(quoteRowCounts(rows)).toEqual({ all: 2, draft_only: 1, live_only: 1, both: 0 });
  });
  it("filters to one", () => {
    expect(filterQuoteRows(rows, "draft_only")).toHaveLength(1);
    expect(filterQuoteRows(rows, "all")).toHaveLength(2);
  });
});

describe("describeQuoteSide", () => {
  it("summarises by tier", () => {
    expect(describeQuoteSide([quote(), quote({ tier: "good" }), quote({ tier: "good" })])).toBe(
      "3 clips (1 strong, 2 good)",
    );
    expect(describeQuoteSide([])).toBe("0 clips");
    expect(describeQuoteSide([quote()])).toBe("1 clip (1 strong)");
  });
});

describe("parseQuoteTrialResults", () => {
  it("reads a stored result and refuses an extraction one", () => {
    const stored = {
      kind: "quotes",
      live: { label: "Built-in", runId: null, quotes: [] },
      draft: { label: "Draft", runId: null, quotes: [] },
      rows: [],
    };
    expect(parseQuoteTrialResults(stored)).not.toBeNull();
    expect(
      parseQuoteTrialResults({ live: { points: [] }, draft: { points: [] }, rows: [] }),
    ).toBeNull();
    expect(parseQuoteTrialResults(null)).toBeNull();
  });
});

describe("samples", () => {
  const projects = [
    { id: "p2", title: "Zed" },
    { id: "p1", title: "Alpha" },
    { id: "p3", title: "Empty" },
  ];
  const themes = [
    { id: "t1", projectId: "p1", title: "Tunnels", supporting: 11, complicating: 2 },
    { id: "t2", projectId: "p2", title: "Water", supporting: 0, complicating: 0 },
    { id: "t3", projectId: "p2", title: "Fort", supporting: 3, complicating: 0 },
  ];
  it("lists projects with a theme that has evidence, alphabetically", () => {
    const samples = groupQuoteSamples({ projects, themes });
    expect(samples.map((entry) => entry.id)).toEqual(["p1", "p2"]);
    expect(samples[0]!.themes[0]!.label).toBe("Tunnels · 11 for, 2 against");
    expect(samples[1]!.themes.map((theme) => theme.id)).toEqual(["t3"]);
  });
  it("keeps the last sample when it is still valid, else the first", () => {
    const samples = groupQuoteSamples({ projects, themes });
    expect(pickDefaultQuoteSample(samples, { projectId: "p2", themeId: "t3" })).toEqual({
      projectId: "p2",
      themeId: "t3",
    });
    expect(pickDefaultQuoteSample(samples, { projectId: "p2", themeId: "gone" })).toEqual({
      projectId: "p1",
      themeId: "t1",
    });
    expect(pickDefaultQuoteSample([], null)).toBeNull();
  });
});
