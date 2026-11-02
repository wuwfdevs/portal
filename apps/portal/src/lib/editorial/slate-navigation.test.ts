import { describe, expect, it } from "vitest";
import { neighbours, nextUnscoredEntryId, selectedEntryId, slateOrder } from "./slate-navigation";

const order = ["a", "b", "c", "d"];

describe("nextUnscoredEntryId", () => {
  it("moves to the next unscored entry after the current one", () => {
    expect(nextUnscoredEntryId(order, new Set(["a", "b"]), "b")).toBe("c");
    expect(nextUnscoredEntryId(order, new Set(["c"]), "b")).toBe("d");
  });

  it("wraps around to an earlier unscored entry", () => {
    expect(nextUnscoredEntryId(order, new Set(["c", "d"]), "d")).toBe("a");
  });

  it("is null once everything is scored", () => {
    expect(nextUnscoredEntryId(order, new Set(order), "b")).toBeNull();
    expect(nextUnscoredEntryId([], new Set(), null)).toBeNull();
  });

  it("never returns the current entry even if it is unscored", () => {
    expect(nextUnscoredEntryId(order, new Set(["a", "c", "d"]), "b")).toBeNull();
  });
});

describe("selectedEntryId", () => {
  it("honours a requested entry that is on the slate", () => {
    expect(selectedEntryId(order, new Set(), "c")).toBe("c");
  });

  it("falls back to the first unscored, then the first", () => {
    expect(selectedEntryId(order, new Set(["a"]), "zzz")).toBe("b");
    expect(selectedEntryId(order, new Set(order), null)).toBe("a");
    expect(selectedEntryId([], new Set(), null)).toBeNull();
  });
});

describe("neighbours", () => {
  it("gives the entries either side, null at the ends", () => {
    expect(neighbours(order, "a")).toEqual({ previous: null, next: "b" });
    expect(neighbours(order, "c")).toEqual({ previous: "b", next: "d" });
    expect(neighbours(order, "d")).toEqual({ previous: "c", next: null });
    expect(neighbours(order, "nope")).toEqual({ previous: null, next: null });
  });
});

describe("slateOrder", () => {
  it("orders by the pitch's submission time, then entry id", () => {
    const slate = [
      { entry: { id: "e2" }, pitch: { created_at: "2026-10-02" } },
      { entry: { id: "e3" }, pitch: { created_at: "2026-10-01" } },
      { entry: { id: "e1" }, pitch: { created_at: "2026-10-02" } },
    ];
    expect(slateOrder(slate).map((item) => item.entry.id)).toEqual(["e3", "e1", "e2"]);
  });
});
