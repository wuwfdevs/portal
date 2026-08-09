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
    expect(isValidMoveDestination(destination({ id: "d1" }), "source-break", "content", "psa", NOW)).toBe(
      true,
    );
  });

  it("rejects the source break itself", () => {
    expect(
      isValidMoveDestination(destination({ id: "source-break" }), "source-break", "content", "psa", NOW),
    ).toBe(false);
  });

  it("rejects a single-occupancy destination that's already filled", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", allow_multiple: false, item_count: 1 }),
        "source-break",
        "content",
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
        "content",
        "psa",
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects a destination already in the past, when live", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", scheduled_at: "2026-08-07T08:00:00.000Z" }),
        "source-break",
        "content",
        "psa",
        NOW,
      ),
    ).toBe(false);
  });

  it("accepts a destination in the past when not live (nowISO null) — pre-air has no 'past'", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", scheduled_at: "2026-08-07T08:00:00.000Z" }),
        "source-break",
        "content",
        "psa",
        null,
      ),
    ).toBe(true);
  });

  it("rejects a destination whose permitted content types don't include the moving content item's type", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source-break", "content", "news", NOW)).toBe(
      false,
    );
  });

  it("rejects a content item with no content type at all", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source-break", "content", null, NOW)).toBe(
      false,
    );
  });

  it("gates a weather item on the destination permitting weather", () => {
    expect(isValidMoveDestination(destination({ id: "d1" }), "source-break", "weather", null, NOW)).toBe(
      false,
    );
    expect(
      isValidMoveDestination(
        destination({ id: "d1", permitted_content_types: ["weather"] }),
        "source-break",
        "weather",
        null,
        NOW,
      ),
    ).toBe(true);
  });

  it("never gates a live_read item on permitted content types", () => {
    expect(
      isValidMoveDestination(
        destination({ id: "d1", permitted_content_types: [] }),
        "source-break",
        "live_read",
        null,
        NOW,
      ),
    ).toBe(true);
  });
});

describe("listValidMoveDestinations", () => {
  it("keeps only valid destinations", () => {
    const destinations = [
      destination({ id: "d1" }),
      destination({ id: "d2", item_count: 1 }),
      destination({ id: "source-break" }),
    ];
    const result = listValidMoveDestinations(destinations, "source-break", "content", "psa", NOW);
    expect(result.map((d) => d.id)).toEqual(["d1"]);
  });
});
