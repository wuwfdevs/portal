import { describe, expect, it } from "vitest";
import {
  blockCoverage,
  firstPageNumber,
  hiddenSummary,
  pointAtBlock,
  pointIdFromMarkId,
  scrubberMarks,
  spanBlockIds,
  suggestedIds,
  transcriptRanges,
} from "./data-point-view";
import type { DataPointSpan } from "./research";

const t = (startMs: number, endMs: number): DataPointSpan => ({ kind: "temporal", startMs, endMs });
const point = (
  id: string,
  spans: DataPointSpan[],
  status: "suggested" | "accepted" | "rejected" = "suggested",
) => ({ id, spans, status, claim: `claim ${id}` });

describe("transcript layer", () => {
  const points = [point("a", [t(0, 10), t(20, 30)]), point("b", [t(5, 6)], "rejected")];
  it("repeats a point per span and drops rejected", () => {
    expect(transcriptRanges(points)).toEqual([
      { id: "a", startMs: 0, endMs: 10 },
      { id: "a", startMs: 20, endMs: 30 },
    ]);
  });
  it("gives each span its own mark id and maps it back", () => {
    const marks = scrubberMarks(points);
    expect(marks.map((m) => m.id)).toEqual(["a#0", "a#1"]);
    expect(marks[0]!.dashed).toBe(true);
    expect(pointIdFromMarkId("a#1")).toBe("a");
  });
  it("lists suggested ids", () => {
    expect([...suggestedIds([...points, point("c", [], "accepted")])]).toEqual(["a"]);
  });
});

describe("document layer", () => {
  const blocks = [
    { id: "b2", pageNumber: 1, readingOrder: 2 },
    { id: "b1", pageNumber: 1, readingOrder: 1 },
    { id: "b3", pageNumber: 1, readingOrder: 3 },
    { id: "c1", pageNumber: 2, readingOrder: 1 },
  ];
  const doc = (first: string | null, last: string | null, page = 1): DataPointSpan => ({
    kind: "document",
    pageNumber: page,
    firstBlockId: first,
    lastBlockId: last,
  });
  it("covers first through last in reading order", () => {
    expect(spanBlockIds(doc("b1", "b3") as never, blocks)).toEqual(["b1", "b2", "b3"]);
    expect(spanBlockIds(doc("b3", "b2") as never, blocks)).toEqual(["b2", "b3"]);
  });
  it("falls back to nothing when a block is gone", () => {
    expect(spanBlockIds(doc("gone", "b2") as never, blocks)).toEqual([]);
    expect(spanBlockIds(doc(null, null) as never, blocks)).toEqual([]);
  });
  it("prefers the point covering fewer blocks", () => {
    const coverage = blockCoverage(
      [point("wide", [doc("b1", "b3")]), point("tight", [doc("b2", "b2")])],
      blocks,
    );
    expect(pointAtBlock(coverage, "b2")).toBe("tight");
    expect(pointAtBlock(coverage, "b1")).toBe("wide");
    expect(pointAtBlock(coverage, "c1")).toBeNull();
  });
  it("finds the first page", () => {
    expect(firstPageNumber(point("p", [doc(null, null, 4), doc(null, null, 3)]))).toBe(3);
    expect(firstPageNumber(point("q", [t(0, 1)]))).toBeNull();
  });
});

describe("hiddenSummary", () => {
  const counts = { total: 12, toReview: 3, accepted: 8, rejected: 2, story: 4 };
  it("names what the To review chip hides", () => {
    expect(hiddenSummary(counts, "to_review")).toBe("8 more accepted · 2 rejected");
    expect(hiddenSummary({ ...counts, accepted: 0, rejected: 0 }, "to_review")).toBe("");
    expect(hiddenSummary(counts, "all")).toBe("");
  });
});
