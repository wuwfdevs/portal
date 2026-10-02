import { describe, expect, it } from "vitest";
import { listUnresolvedEntries, type UnresolvedReviewBreakLike } from "./submission";

function item(id: string, requiresConfirmation = true) {
  return { id, requiresConfirmation };
}

function brk(overrides: Partial<UnresolvedReviewBreakLike> & { id: string }): UnresolvedReviewBreakLike {
  return { requirement: "optional", items: [], ...overrides };
}

describe("listUnresolvedEntries", () => {
  it("flags a placed item that requires confirmation and has no recorded outcome", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", items: [item("item-1")] })], new Set());
    expect(result).toEqual([{ breakId: "b1", itemId: "item-1" }]);
  });

  it("clears a placed item once it has a recorded outcome", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", items: [item("item-1")] })],
      new Set(["item-1"]),
    );
    expect(result).toEqual([]);
  });

  it("never flags an item that doesn't require confirmation, regardless of outcome state", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", items: [item("item-1", false)] })],
      new Set(),
    );
    expect(result).toEqual([]);
  });

  it("flags an empty required break as the break itself, not an item", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", requirement: "required", items: [] })], new Set());
    expect(result).toEqual([{ breakId: "b1", itemId: null }]);
  });

  it("does not flag an empty optional break — carrying network is resolved", () => {
    const result = listUnresolvedEntries([brk({ id: "b1", requirement: "optional", items: [] })], new Set());
    expect(result).toEqual([]);
  });

  it("does not flag a required break that's filled with items that don't require confirmation", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", requirement: "required", items: [item("item-1", false)] })],
      new Set(),
    );
    expect(result).toEqual([]);
  });

  it("flags every unconfirmed confirmation-requiring item in a multi-item break independently", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", items: [item("item-1"), item("item-2")] })],
      new Set(["item-1"]),
    );
    expect(result).toEqual([{ breakId: "b1", itemId: "item-2" }]);
  });

  it("a required break with a confirmed item placed is judged by the item, not flagged as an empty break", () => {
    const result = listUnresolvedEntries(
      [brk({ id: "b1", requirement: "required", items: [item("item-1")] })],
      new Set(["item-1"]),
    );
    expect(result).toEqual([]);
  });
});
