import { describe, expect, it } from "vitest";
import { countBy, groupBy, indexBy, sumBy, uniqueBy } from "./collections";

const rows = [
  { id: 1, parent: "a", n: 2 },
  { id: 2, parent: "b", n: 3 },
  { id: 3, parent: "a", n: 5 },
];

describe("collections", () => {
  it("groups in original order", () => {
    const groups = groupBy(rows, (r) => r.parent);
    expect(groups.get("a")?.map((r) => r.id)).toEqual([1, 3]);
    expect(groups.get("b")?.map((r) => r.id)).toEqual([2]);
    expect(groups.get("c")).toBeUndefined();
  });
  it("indexes, the later row winning a clash", () => {
    expect(indexBy(rows, (r) => r.parent).get("a")?.id).toBe(3);
  });
  it("counts and sums", () => {
    expect(countBy(rows, (r) => r.parent).get("a")).toBe(2);
    expect(sumBy(rows, (r) => r.n)).toBe(10);
    expect(sumBy([], (r: { n: number }) => r.n)).toBe(0);
  });
  it("lists distinct keys in first-seen order", () => {
    expect(uniqueBy(rows, (r) => r.parent)).toEqual(["a", "b"]);
  });
});
