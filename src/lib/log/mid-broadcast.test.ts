import { describe, expect, it } from "vitest";
import { isValidMoveDestination, listValidMoveDestinations, type MoveDestinationLike } from "./mid-broadcast";

function destination(overrides: Partial<MoveDestinationLike> & { id: string }): MoveDestinationLike {
  return {
    content_item_id: null,
    scheduled_at: "2026-08-07T10:00:00.000Z",
    slot: { permitted_content_types: ["psa", "legal_id"] },
    ...overrides,
  };
}

const NOW = "2026-08-07T09:00:00.000Z";

describe("isValidMoveDestination", () => {
  it("accepts an empty, future, content-type-permitted destination", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source", "psa", NOW)).toBe(true);
  });

  it("rejects the source item itself", () => {
    expect(isValidMoveDestination(destination({ id: "source" }), "source", "psa", NOW)).toBe(false);
  });

  it("rejects an already-filled destination", () => {
    expect(
      isValidMoveDestination(destination({ id: "d1", content_item_id: "other" }), "source", "psa", NOW),
    ).toBe(false);
  });

  it("rejects a destination already in the past", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", scheduled_at: "2026-08-07T08:00:00.000Z" }),
        "source",
        "psa",
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects a destination whose slot doesn't permit the content type", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source", "news", NOW)).toBe(false);
  });
});

describe("listValidMoveDestinations", () => {
  it("keeps only valid destinations", () => {
    const destinations = [
      destination({ id: "d1" }),
      destination({ id: "d2", content_item_id: "other" }),
      destination({ id: "source" }),
    ];
    const result = listValidMoveDestinations(destinations, "source", "psa", NOW);
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });
});
