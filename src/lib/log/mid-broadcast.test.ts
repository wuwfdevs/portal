import { describe, expect, it } from "vitest";
import { isValidMoveDestination, listValidMoveDestinations, type MoveDestinationBreakLike } from "./mid-broadcast";

function destination(overrides: Partial<MoveDestinationBreakLike> & { id: string }): MoveDestinationBreakLike {
  return {
    scheduled_at: "2026-08-07T10:00:00.000Z",
    permitted_content_types: ["psa", "legal_id"],
    allow_multiple: false,
    item_count: 0,
    ...overrides,
  };
}

const NOW = "2026-08-07T09:00:00.000Z";

describe("isValidMoveDestination", () => {
  it("accepts an empty, future, content-type-permitted destination", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source-break", "psa", NOW)).toBe(true);
  });

  it("rejects the source break itself", () => {
    expect(isValidMoveDestination(destination({ id: "source-break" }), "source-break", "psa", NOW)).toBe(false);
  });

  it("rejects a single-occupancy destination that's already filled", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", allow_multiple: false, item_count: 1 }),
        "source-break",
        "psa",
        NOW,
      ),
    ).toBe(false);
  });

  it("accepts a multi-occupancy destination that already has an item, as long as it allows more", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", allow_multiple: true, item_count: 2 }),
        "source-break",
        "psa",
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects a destination already in the past", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", scheduled_at: "2026-08-07T08:00:00.000Z" }),
        "source-break",
        "psa",
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects a destination whose permitted content types don't include the moving item's type", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source-break", "news", NOW)).toBe(false);
  });
});

describe("listValidMoveDestinations", () => {
  it("keeps only valid destinations", () => {
    const destinations = [
      destination({ id: "d1" }),
      destination({ id: "d2", item_count: 1 }),
      destination({ id: "source-break" }),
    ];
    const result = listValidMoveDestinations(destinations, "source-break", "psa", NOW);
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });
});
