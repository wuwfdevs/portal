import { describe, expect, it } from "vitest";
import {
  draftDiffersFromLive,
  eligibleSamples,
  formatElapsed,
  initialPromptText,
  limitRows,
  parseTrialShow,
  pickDefaultSample,
  trialHeading,
} from "./trial-sample";

describe("initialPromptText", () => {
  it("prefers the draft, then live, then the built-in", () => {
    expect(initialPromptText({ draft: "d", live: "l", builtIn: "b" })).toBe("d");
    expect(initialPromptText({ draft: null, live: "l", builtIn: "b" })).toBe("l");
    expect(initialPromptText({ draft: null, live: null, builtIn: "b" })).toBe("b");
    expect(initialPromptText({ draft: "", live: "l", builtIn: "b" })).toBe("");
  });
});

describe("draftDiffersFromLive", () => {
  it("ignores line endings and outer blanks", () => {
    expect(draftDiffersFromLive("a\r\nb \n", "a\nb")).toBe(false);
    expect(draftDiffersFromLive("a\nc", "a\nb")).toBe(true);
    expect(draftDiffersFromLive(null, "a")).toBe(false);
  });
});

describe("eligibleSamples", () => {
  const base = {
    projects: [
      { id: "p1", title: "Zed" },
      { id: "p2", title: "Alpha" },
      { id: "p3", title: "No questions" },
      { id: "p4", title: "Only a failed source" },
    ],
    projectsWithQuestions: new Set(["p1", "p2", "p4"]),
    links: [
      { projectId: "p1", sourceId: "s1" },
      { projectId: "p2", sourceId: "s2" },
      { projectId: "p2", sourceId: "s3" },
      { projectId: "p3", sourceId: "s1" },
      { projectId: "p4", sourceId: "s4" },
    ],
    sources: [
      { id: "s1", title: "Tom", status: "ready", durationMs: 3_492_000 },
      { id: "s2", title: "Marlene", status: "ready", durationMs: null },
      { id: "s3", title: "Uploading", status: "uploading", durationMs: null },
      { id: "s4", title: "Broken", status: "failed", durationMs: null },
    ],
  };
  it("keeps projects with questions and a ready source, sorted, with ready sources only", () => {
    const result = eligibleSamples(base);
    expect(result.map((p) => p.title)).toEqual(["Alpha", "Zed"]);
    expect(result[0]!.sources).toEqual([{ id: "s2", label: "Marlene" }]);
    expect(result[1]!.sources[0]!.label).toBe("Tom · 58:12");
  });
  it("is empty when nothing qualifies", () => {
    expect(eligibleSamples({ ...base, projectsWithQuestions: new Set() })).toEqual([]);
  });
});

describe("pickDefaultSample", () => {
  const samples = [
    {
      id: "p",
      title: "P",
      sources: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
  ];
  it("uses the last sample when it is still available", () => {
    expect(pickDefaultSample(samples, { projectId: "p", sourceId: "b" })).toEqual({
      projectId: "p",
      sourceId: "b",
    });
  });
  it("falls back to the first, or null", () => {
    expect(pickDefaultSample(samples, { projectId: "x", sourceId: "b" })).toEqual({
      projectId: "p",
      sourceId: "a",
    });
    expect(pickDefaultSample([], null)).toBeNull();
  });
});

describe("display rules", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(72_000)).toBe("1m 12s");
    expect(formatElapsed(45_400)).toBe("45s");
  });
  it("limits rows unless all are asked for", () => {
    const rows = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(limitRows(rows, false)).toEqual({ shown: [1, 2, 3, 4, 5, 6], hidden: 2 });
    expect(limitRows(rows, true).hidden).toBe(0);
    expect(limitRows([1, 2], false).hidden).toBe(0);
  });
  it("parses the show switch and heading", () => {
    expect(parseTrialShow("live_only")).toBe("live_only");
    expect(parseTrialShow("zzz")).toBe("all");
    expect(trialHeading(7)).toBe("Draft compared with live v7");
    expect(trialHeading(null)).toBe("Draft compared with the built-in text");
  });
});
