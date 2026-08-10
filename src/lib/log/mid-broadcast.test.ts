import { describe, expect, it } from "vitest";
import {
  isValidCreditRelocationDestination,
  isValidMoveDestination,
  listValidMoveDestinations,
  sortByProximityToOriginal,
  type CreditRelocationBreakLike,
  type MoveDestinationBreakLike,
} from "./mid-broadcast";

function destination(overrides: Partial<MoveDestinationBreakLike> & { id: string }): MoveDestinationBreakLike {
  return {
    scheduled_at: "2026-08-07T10:00:00.000Z",
    permitted_content_types: ["psa", "legal_id"],
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

  it("accepts a destination that already has content — no item-count cap", () => {
    expect(
      isValidMoveDestination(destination({ id: "d1" }), "source-break", "content", "psa", NOW),
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
      destination({ id: "d2" }),
      destination({ id: "source-break" }),
    ];
    const result = listValidMoveDestinations(destinations, "source-break", "content", "psa", NOW);
    expect(result.map((d) => d.id)).toEqual(["d1", "d2"]);
  });
});

function creditDestination(
  overrides: Partial<CreditRelocationBreakLike> & { id: string },
): CreditRelocationBreakLike {
  return {
    rundown_id: "rundown-1",
    scheduled_at: "2026-08-07T10:00:00.000Z",
    permitted_content_types: ["underwriting_credit"],
    ...overrides,
  };
}

describe("isValidCreditRelocationDestination", () => {
  it("accepts an open, eligible break in the same rundown", () => {
    expect(isValidCreditRelocationDestination(creditDestination({ id: "d1" }), "source-break", "rundown-1", NOW)).toBe(
      true,
    );
  });

  it("rejects the source break itself", () => {
    expect(
      isValidCreditRelocationDestination(creditDestination({ id: "source-break" }), "source-break", "rundown-1", NOW),
    ).toBe(false);
  });

  it("rejects a break in a different rundown", () => {
    expect(
      isValidCreditRelocationDestination(
        creditDestination({ id: "d1", rundown_id: "rundown-2" }),
        "source-break",
        "rundown-1",
        NOW,
      ),
    ).toBe(false);
  });

  it("rejects a break that doesn't permit underwriting credits", () => {
    expect(
      isValidCreditRelocationDestination(
        creditDestination({ id: "d1", permitted_content_types: ["psa"] }),
        "source-break",
        "rundown-1",
        NOW,
      ),
    ).toBe(false);
  });

  it("accepts an already-occupied break — no item-count cap", () => {
    expect(
      isValidCreditRelocationDestination(
        creditDestination({ id: "d1" }),
        "source-break",
        "rundown-1",
        NOW,
      ),
    ).toBe(true);
  });

  it("rejects a destination already in the past, when live", () => {
    expect(
      isValidCreditRelocationDestination(
        creditDestination({ id: "d1", scheduled_at: "2026-08-07T08:00:00.000Z" }),
        "source-break",
        "rundown-1",
        NOW,
      ),
    ).toBe(false);
  });

  it("accepts a destination in the past when not live — a credit can still be planned pre-air", () => {
    expect(
      isValidCreditRelocationDestination(
        creditDestination({ id: "d1", scheduled_at: "2026-08-07T08:00:00.000Z" }),
        "source-break",
        "rundown-1",
        null,
      ),
    ).toBe(true);
  });
});

describe("sortByProximityToOriginal", () => {
  it("orders candidates by closeness to the original time, nearest first", () => {
    const breaks = [
      creditDestination({ id: "far-after", scheduled_at: "2026-08-07T12:00:00.000Z" }),
      creditDestination({ id: "near-before", scheduled_at: "2026-08-07T09:55:00.000Z" }),
      creditDestination({ id: "near-after", scheduled_at: "2026-08-07T10:05:00.000Z" }),
    ];
    const result = sortByProximityToOriginal(breaks, "2026-08-07T10:00:00.000Z");
    expect(result.map((b) => b.id)).toEqual(["near-before", "near-after", "far-after"]);
  });

  it("keeps input order for equal distances", () => {
    const breaks = [
      creditDestination({ id: "before", scheduled_at: "2026-08-07T09:55:00.000Z" }),
      creditDestination({ id: "after", scheduled_at: "2026-08-07T10:05:00.000Z" }),
    ];
    const result = sortByProximityToOriginal(breaks, "2026-08-07T10:00:00.000Z");
    expect(result.map((b) => b.id)).toEqual(["before", "after"]);
  });
});
