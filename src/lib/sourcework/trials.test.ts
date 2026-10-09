import { describe, expect, it } from "vitest";
import {
  describeTrialSide,
  filterTrialRows,
  matchTrialPoints,
  parseTrialResults,
  trialRowCounts,
  type TrialPoint,
} from "./trials";

function point(unitIds: number[], claim = "c", relevance: "question" | "story" = "question"): TrialPoint {
  return { claim, tag: "t", relevance, storyElement: null, spans: [], unitIds };
}

describe("matchTrialPoints", () => {
  it("pairs points that sit on the same passage, even when the wording differs", () => {
    const rows = matchTrialPoints([point([1, 2, 3], "live")], [point([2, 3], "draft")]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ group: "both" });
    expect(rows[0]!.live!.claim).toBe("live");
    expect(rows[0]!.draft!.claim).toBe("draft");
  });

  it("lists what only one side found, in source order", () => {
    const rows = matchTrialPoints(
      [point([1, 2]), point([20], "lost")],
      [point([1, 2]), point([10], "new")],
    );
    expect(rows.map((row) => row.group)).toEqual(["both", "draft_only", "live_only"]);
    expect(rows[1]!.draft!.claim).toBe("new");
    expect(rows[2]!.live!.claim).toBe("lost");
  });

  it("pairs one-to-one, best overlap first", () => {
    const rows = matchTrialPoints([point([1, 2, 3, 4])], [point([1, 2]), point([1, 2, 3, 4])]);
    const both = rows.find((row) => row.group === "both")!;
    expect(both.draft!.unitIds).toEqual([1, 2, 3, 4]);
    expect(rows.filter((row) => row.group === "draft_only")).toHaveLength(1);
  });

  it("matches nothing when overlap is under half", () => {
    const rows = matchTrialPoints([point([1, 2, 3, 4])], [point([4, 5, 6, 7])]);
    expect(rows.map((row) => row.group).sort()).toEqual(["draft_only", "live_only"]);
  });
});

describe("filters and counts", () => {
  const rows = matchTrialPoints([point([1]), point([9])], [point([1]), point([5])]);
  it("counts each group", () => {
    expect(trialRowCounts(rows)).toEqual({ all: 3, both: 1, draft_only: 1, live_only: 1 });
  });
  it("filters", () => {
    expect(filterTrialRows(rows, "both")).toHaveLength(1);
    expect(filterTrialRows(rows, "all")).toHaveLength(3);
  });
  it("describes a side like the design", () => {
    expect(describeTrialSide([{ relevance: "question" }, { relevance: "story" }])).toBe("2 data points (1 responsive, 1 story)");
    expect(describeTrialSide([{ relevance: "story" }])).toBe("1 data point (0 responsive, 1 story)");
  });
});

describe("parseTrialResults", () => {
  it("accepts a stored shape and refuses anything else", () => {
    const stored = { live: { label: "Live v7", runId: null, points: [] }, draft: { label: "Draft", runId: null, points: [] }, rows: [] };
    expect(parseTrialResults(stored)).toEqual(stored);
    expect(parseTrialResults({})).toBeNull();
    expect(parseTrialResults(null)).toBeNull();
  });
});
