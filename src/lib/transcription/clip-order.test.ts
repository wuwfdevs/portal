import { describe, expect, it } from "vitest";
import { filterClips, orderClips } from "./clip-order";
import type { ProjectClip } from "./clips";

const clip = (id: string, startMs: number, title = id, excerpt = ""): ProjectClip => ({
  id,
  title,
  startMs,
  endMs: startMs + 1000,
  excerpt,
  exportedAt: null,
  hasExport: false,
});
// Made in this order: c at 30s, a at 10s, b at 20s.
const made = [clip("c", 30_000), clip("a", 10_000), clip("b", 20_000)];

describe("orderClips", () => {
  it("follows the recording", () => {
    expect(orderClips(made, "in_order").map((c) => c.id)).toEqual(["a", "b", "c"]);
  });

  it("puts the most recently made first", () => {
    expect(orderClips(made, "newest").map((c) => c.id)).toEqual(["b", "a", "c"]);
  });

  it("does not change the list it is given", () => {
    orderClips(made, "newest");
    expect(made.map((c) => c.id)).toEqual(["c", "a", "b"]);
  });
});

describe("filterClips", () => {
  const list = [clip("1", 0, "Why the cost doubled", "approach spans"), clip("2", 1, "Steel", "")];

  it("matches title or quoted words, ignoring case", () => {
    expect(filterClips(list, "COST").map((c) => c.id)).toEqual(["1"]);
    expect(filterClips(list, "spans").map((c) => c.id)).toEqual(["1"]);
  });

  it("returns everything for a blank query", () => {
    expect(filterClips(list, "  ")).toBe(list);
  });
});
