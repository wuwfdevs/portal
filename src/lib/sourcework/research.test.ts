import { describe, expect, it } from "vitest";
import {
  moveAmongActive,
  defaultDataPointFilter,
  filterDataPoints,
  firstStartMs,
  formatSpans,
  hostLabel,
  questionLabels,
  reorderQuestionIds,
  reviewCounts,
  sortDataPointsBySpan,
  dataPointTag,
  type DataPointSpan,
} from "./research";

describe("questionLabels", () => {
  it("numbers by order across all questions, archived included", () => {
    const labels = questionLabels([
      { id: "c", position: 2, createdAt: "2026-01-03" },
      { id: "a", position: 0, createdAt: "2026-01-01" },
      { id: "b", position: 1, createdAt: "2026-01-02" },
    ]);
    expect([labels.get("a"), labels.get("b"), labels.get("c")]).toEqual(["Q1", "Q2", "Q3"]);
  });
  it("breaks position ties by creation time", () => {
    const labels = questionLabels([
      { id: "b", position: 0, createdAt: "2026-01-02" },
      { id: "a", position: 0, createdAt: "2026-01-01" },
    ]);
    expect(labels.get("a")).toBe("Q1");
  });
});

describe("reorderQuestionIds", () => {
  it("moves one step and refuses to leave the list", () => {
    expect(reorderQuestionIds(["a", "b", "c"], "b", "up")).toEqual(["b", "a", "c"]);
    expect(reorderQuestionIds(["a", "b", "c"], "b", "down")).toEqual(["a", "c", "b"]);
    expect(reorderQuestionIds(["a", "b"], "a", "up")).toBeNull();
    expect(reorderQuestionIds(["a", "b"], "b", "down")).toBeNull();
    expect(reorderQuestionIds(["a"], "z", "up")).toBeNull();
  });
});

describe("hostLabel", () => {
  it("is the host without www", () => {
    expect(hostLabel("https://www.nps.gov/pere/x.htm")).toBe("nps.gov");
    expect(hostLabel("not a url")).toBe("");
  });
});

describe("dataPointTag", () => {
  const labels = new Map([["q1", "Q1"]]);
  it("names the question or the story element", () => {
    expect(dataPointTag({ kind: "firsthand", relevance: "question", storyElement: null, questionId: "q1" }, labels)).toBe("Firsthand · Q1");
    expect(dataPointTag({ kind: "secondhand", relevance: "story", storyElement: "place", questionId: null }, labels)).toBe("Secondhand · Story · Place");
  });
});

describe("spans", () => {
  const temporal = (startMs: number, endMs: number): DataPointSpan => ({ kind: "temporal", startMs, endMs });
  it("formats one, several, and document spans", () => {
    expect(formatSpans([temporal(782_000, 791_000)])).toBe("13:02–13:11");
    expect(formatSpans([temporal(761_000, 778_000), temporal(782_000, 786_000)])).toBe("12:41–12:58 · 13:02–13:06 · 2 spans");
    expect(formatSpans([{ kind: "document", pageNumber: 3, firstBlockId: null, lastBlockId: null }])).toBe("p. 3");
    expect(
      formatSpans([
        { kind: "document", pageNumber: 3, firstBlockId: null, lastBlockId: null },
        { kind: "document", pageNumber: 4, firstBlockId: null, lastBlockId: null },
      ]),
    ).toBe("pp. 3–4");
    expect(formatSpans([])).toBe("");
  });
  it("finds the earliest start", () => {
    expect(firstStartMs([temporal(5, 9), temporal(2, 3)])).toBe(2);
    expect(firstStartMs([{ kind: "document", pageNumber: 1, firstBlockId: null, lastBlockId: null }])).toBeNull();
  });
});

describe("review", () => {
  const points = [
    { id: "1", status: "suggested" as const, relevance: "question" as const, spans: [] },
    { id: "2", status: "accepted" as const, relevance: "story" as const, spans: [] },
    { id: "3", status: "rejected" as const, relevance: "story" as const, spans: [] },
    { id: "4", status: "suggested" as const, relevance: "story" as const, spans: [] },
  ];
  it("counts what each chip shows", () => {
    expect(reviewCounts(points)).toEqual({ total: 3, toReview: 2, accepted: 1, rejected: 1, story: 2 });
  });
  it("filters", () => {
    expect(filterDataPoints(points, "to_review").map((p) => p.id)).toEqual(["1", "4"]);
    expect(filterDataPoints(points, "all").map((p) => p.id)).toEqual(["1", "2", "4"]);
    expect(filterDataPoints(points, "story").map((p) => p.id)).toEqual(["2", "4"]);
    expect(filterDataPoints(points, "rejected").map((p) => p.id)).toEqual(["3"]);
  });
  it("opens on what needs a decision", () => {
    expect(defaultDataPointFilter({ toReview: 2 })).toBe("to_review");
    expect(defaultDataPointFilter({ toReview: 0 })).toBe("all");
  });
  it("sorts by where the first span sits", () => {
    const sorted = sortDataPointsBySpan([
      { id: "b", spans: [{ kind: "temporal" as const, startMs: 9, endMs: 10 }] },
      { id: "a", spans: [{ kind: "temporal" as const, startMs: 1, endMs: 2 }] },
      { id: "c", spans: [] },
    ]);
    expect(sorted.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });
});

describe("moveAmongActive", () => {
  const list = [
    { id: "a", archived: false },
    { id: "x", archived: true },
    { id: "b", archived: false },
    { id: "c", archived: false },
  ];
  it("swaps with the nearest active neighbour and leaves archived slots alone", () => {
    expect(moveAmongActive(list, "b", "up")).toEqual(["b", "x", "a", "c"]);
    expect(moveAmongActive(list, "b", "down")).toEqual(["a", "x", "c", "b"]);
  });
  it("refuses to leave the list", () => {
    expect(moveAmongActive(list, "a", "up")).toBeNull();
    expect(moveAmongActive(list, "c", "down")).toBeNull();
    expect(moveAmongActive(list, "x", "up")).toBeNull();
  });
});
