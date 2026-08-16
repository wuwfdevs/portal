import { describe, it, expect } from "vitest";
import { wouldCreateThemeCycle } from "./theme-hierarchy";

describe("wouldCreateThemeCycle", () => {
  it("rejects a theme becoming its own parent", () => {
    expect(wouldCreateThemeCycle("a", "a", new Map())).toBe(true);
  });

  it("allows a genuinely new, unrelated parent", () => {
    const parents = new Map<string, string | null>([
      ["a", null],
      ["b", null],
    ]);
    expect(wouldCreateThemeCycle("a", "b", parents)).toBe(false);
  });

  it("rejects a direct child becoming its own parent's parent", () => {
    // b is currently a child of a; setting a's parent to b would loop a -> b -> a.
    const parents = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
    ]);
    expect(wouldCreateThemeCycle("a", "b", parents)).toBe(true);
  });

  it("rejects a deep descendant several levels down", () => {
    // c -> b -> a (c's parent is b, b's parent is a). Setting a's parent to c
    // would close a long loop, not just an immediate one.
    const parents = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", "b"],
    ]);
    expect(wouldCreateThemeCycle("a", "c", parents)).toBe(true);
  });

  it("allows attaching to an unrelated branch of a larger tree", () => {
    const parents = new Map<string, string | null>([
      ["a", null],
      ["b", "a"],
      ["c", null],
    ]);
    expect(wouldCreateThemeCycle("c", "b", parents)).toBe(false);
  });

  it("does not loop forever against an already-corrupt chain", () => {
    const parents = new Map<string, string | null>([
      ["x", "y"],
      ["y", "x"],
    ]);
    expect(wouldCreateThemeCycle("z", "x", parents)).toBe(false);
  });
});
