import { describe, expect, it } from "vitest";
import {
  countResultsByKind,
  filterResultsByKind,
  groupResultsByProject,
  parseSearchKind,
  splitHighlight,
} from "./search-groups";
import type { SearchResult } from "./search";

function hit(
  id: string,
  projectId: string,
  kind: SearchResult["kind"] = "transcript",
): SearchResult {
  return {
    kind,
    id,
    projectId,
    sourceId: null,
    projectTitle: `Project ${projectId}`,
    projectDescription: null,
    interviewDate: null,
    startMs: null,
    endMs: null,
    pageNumber: null,
    title: null,
    snippet: "",
    speakerLabel: null,
  };
}

describe("groupResultsByProject", () => {
  it("groups by project, in the order each project's best hit ranked", () => {
    const groups = groupResultsByProject([
      hit("1", "b"),
      hit("2", "a"),
      hit("3", "b"),
      hit("4", "c"),
      hit("5", "a"),
    ]);
    expect(groups.map((g) => g.projectId)).toEqual(["b", "a", "c"]);
    expect(groups[0]!.results.map((r) => r.id)).toEqual(["1", "3"]);
    expect(groups[1]!.results.map((r) => r.id)).toEqual(["2", "5"]);
  });
});

describe("kind filter", () => {
  const results = [hit("1", "a", "clip"), hit("2", "a"), hit("3", "b", "document"), hit("4", "b")];

  it("counts each kind and the total", () => {
    expect(countResultsByKind(results)).toEqual({
      all: 4,
      clip: 1,
      transcript: 2,
      document: 1,
      project: 0,
    });
  });

  it("narrows to one kind, or none", () => {
    expect(filterResultsByKind(results, "transcript").map((r) => r.id)).toEqual(["2", "4"]);
    expect(filterResultsByKind(results, "all")).toBe(results);
  });

  it("falls back to all for anything unknown", () => {
    expect(parseSearchKind("clip")).toBe("clip");
    expect(parseSearchKind("nonsense")).toBe("all");
    expect(parseSearchKind(undefined)).toBe("all");
  });
});

describe("splitHighlight", () => {
  it("marks the query words, case-insensitively, and keeps the original text", () => {
    const parts = splitHighlight("The Bridge cost doubled", "bridge cost");
    expect(parts.map((p) => p.text).join("")).toBe("The Bridge cost doubled");
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(["Bridge", "cost"]);
  });

  it("marks nothing for a one-letter query or when no word matches", () => {
    expect(splitHighlight("A bridge", "a")).toEqual([{ text: "A bridge", hit: false }]);
    expect(splitHighlight("steel", "bridge")).toEqual([{ text: "steel", hit: false }]);
  });

  it("is safe with regex characters in the query", () => {
    expect(() => splitHighlight("cost (est.)", "(est.")).not.toThrow();
  });
});
