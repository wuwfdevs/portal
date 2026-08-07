import { describe, expect, it } from "vitest";
import { listUnresolvedItems, type UnresolvedReviewItemLike } from "./submission";

function item(overrides: Partial<UnresolvedReviewItemLike> & { id: string }): UnresolvedReviewItemLike {
  return {
    content_item_id: null,
    requirement_level: "optional",
    ...overrides,
  };
}

describe("listUnresolvedItems", () => {
  it("flags a filled item with no recorded outcome", () => {
    const result = listUnresolvedItems([item({ id: "a", content_item_id: "content-1" })], new Set());
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("clears a filled item once it has a recorded outcome", () => {
    const result = listUnresolvedItems(
      [item({ id: "a", content_item_id: "content-1" })],
      new Set(["a"]),
    );
    expect(result).toEqual([]);
  });

  it("flags an empty required item", () => {
    const result = listUnresolvedItems([item({ id: "a", requirement_level: "required" })], new Set());
    expect(result.map((i) => i.id)).toEqual(["a"]);
  });

  it("does not flag an empty optional or suggested item", () => {
    const result = listUnresolvedItems(
      [item({ id: "a", requirement_level: "optional" }), item({ id: "b", requirement_level: "suggested" })],
      new Set(),
    );
    expect(result).toEqual([]);
  });

  it("does not flag a moved item's cleared (optional) source, only its still-filled destination", () => {
    const items = [
      item({ id: "source", content_item_id: null, requirement_level: "optional" }),
      item({ id: "destination", content_item_id: "content-1" }),
    ];
    // Source got a 'skipped' broadcast event when it was moved; destination has none yet.
    const result = listUnresolvedItems(items, new Set(["source"]));
    expect(result.map((i) => i.id)).toEqual(["destination"]);
  });
});
