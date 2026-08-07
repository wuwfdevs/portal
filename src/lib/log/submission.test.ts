import { describe, expect, it } from "vitest";
import { listUnresolvedEntries, type UnresolvedReviewBreakLike } from "./submission";

function brk(overrides: Partial<UnresolvedReviewBreakLike> & { id: string }): UnresolvedReviewBreakLike {
  return { requirement: "optional", itemIds: [], ...overrides };
}

describe("listUnresolvedEntries", () => {
  it("flags a placed item with no recorded outcome", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", itemIds: ["item-1"] })], new Set());
    expect(result).toEqual([{ breakId: "b1", itemId: "item-1" }]);
  });

  it("clears a placed item once it has a recorded outcome", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", itemIds: ["item-1"] })], new Set(["item-1"]));
    expect(result).toEqual([]);
  });

  it("flags an empty required break as the break itself, not an item", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", requirement: "required", itemIds: [] })], new Set());
    expect(result).toEqual([{ breakId: "b1", itemId: null }]);
  });

  it("does not flag an empty optional break — carrying network is resolved", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", requirement: "optional", itemIds: [] })], new Set());
    expect(result).toEqual([]);
  });

  it("flags every unconfirmed item in a multi-item break independently", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", itemIds: ["item-1", "item-2"] })],
      new Set(["item-1"]),
    );
    expect(result).toEqual([{ breakId: "b1", itemId: "item-2" }]);
  });

  it("a required break with an item placed is judged by the item, not flagged as an empty break", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", requirement: "required", itemIds: ["item-1"] })],
      new Set(["item-1"]),
    );
    expect(result).toEqual([]);
  });
});
