import { describe, expect, it } from "vitest";
import {
  availableStatusActions,
  derivePublicAvailability,
  deriveQuestionEditability,
  MAX_QUESTIONS,
  reorderPositions,
  validateQueryInput,
  validateQuestionInput,
} from "./query-state";

const NOW = new Date("2026-08-01T12:00:00Z");

describe("derivePublicAvailability", () => {
  // Mirrors the CASE inside al_public_query() — these cases are the written-down
  // version of that rule.
  it("hides a draft entirely", () => {
    expect(
      derivePublicAvailability({ status: "draft", opens_at: null, closes_at: null }, NOW),
    ).toBe("unavailable");
  });

  it("is open when the status is open and no window applies", () => {
    expect(derivePublicAvailability({ status: "open", opens_at: null, closes_at: null }, NOW)).toBe(
      "open",
    );
  });

  it("is not yet open before the opening date", () => {
    expect(
      derivePublicAvailability(
        { status: "open", opens_at: "2026-08-02T00:00:00Z", closes_at: null },
        NOW,
      ),
    ).toBe("not_yet_open");
  });

  it("is closed once the closing date has passed, even while status says open", () => {
    expect(
      derivePublicAvailability(
        { status: "open", opens_at: null, closes_at: "2026-07-31T00:00:00Z" },
        NOW,
      ),
    ).toBe("closed");
  });

  it("treats closed and archived alike from the public side", () => {
    expect(
      derivePublicAvailability({ status: "closed", opens_at: null, closes_at: null }, NOW),
    ).toBe("closed");
    expect(
      derivePublicAvailability({ status: "archived", opens_at: null, closes_at: null }, NOW),
    ).toBe("closed");
  });

  it("opens exactly at the opening instant and closes exactly at the closing one", () => {
    expect(
      derivePublicAvailability(
        { status: "open", opens_at: NOW.toISOString(), closes_at: null },
        NOW,
      ),
    ).toBe("open");
    expect(
      derivePublicAvailability(
        { status: "open", opens_at: null, closes_at: NOW.toISOString() },
        NOW,
      ),
    ).toBe("closed");
  });
});

describe("deriveQuestionEditability", () => {
  it("allows everything on an unused query", () => {
    const result = deriveQuestionEditability({ questionCount: 2, submissionCount: 0 });
    expect(result).toMatchObject({ canAdd: true, canRemove: true, canReorder: true });
    expect(result.notice).toBeNull();
  });

  it("locks removal and reordering once a submission exists, and says why", () => {
    const result = deriveQuestionEditability({ questionCount: 2, submissionCount: 1 });
    expect(result.canRemove).toBe(false);
    expect(result.canReorder).toBe(false);
    // Wording stays editable — that is the whole point of snapshotting.
    expect(result.canAdd).toBe(true);
    expect(result.notice).toContain("existing answers keep the exact question");
  });

  it("stops adding at the ceiling", () => {
    const result = deriveQuestionEditability({
      questionCount: MAX_QUESTIONS,
      submissionCount: 0,
    });
    expect(result.canAdd).toBe(false);
    expect(result.notice).toContain(`at most ${MAX_QUESTIONS}`);
  });

  it("reports both constraints at once", () => {
    const result = deriveQuestionEditability({
      questionCount: MAX_QUESTIONS,
      submissionCount: 3,
    });
    expect(result.notice).toContain("existing answers");
    expect(result.notice).toContain(`at most ${MAX_QUESTIONS}`);
  });
});

describe("availableStatusActions", () => {
  it("only offers opening from a draft", () => {
    expect(availableStatusActions("draft")).toEqual(["open"]);
  });

  it("offers reopening or archiving once closed", () => {
    expect(availableStatusActions("closed")).toEqual(["open", "archived"]);
  });

  it("is a dead end once archived", () => {
    expect(availableStatusActions("archived")).toEqual([]);
  });
});

describe("validateQueryInput", () => {
  it("requires both titles", () => {
    expect(validateQueryInput({ internalTitle: " ", publicTitle: "x" })).toContain(
      "internal title",
    );
    expect(validateQueryInput({ internalTitle: "x", publicTitle: "" })).toContain("public title");
  });

  it("refuses a closing date before the opening one", () => {
    expect(
      validateQueryInput({
        internalTitle: "x",
        publicTitle: "y",
        opensAt: "2026-08-10T00:00:00Z",
        closesAt: "2026-08-01T00:00:00Z",
      }),
    ).toContain("after the opening date");
  });

  it("accepts a valid window", () => {
    expect(
      validateQueryInput({
        internalTitle: "x",
        publicTitle: "y",
        opensAt: "2026-08-01T00:00:00Z",
        closesAt: "2026-08-10T00:00:00Z",
      }),
    ).toBeNull();
  });
});

describe("validateQuestionInput", () => {
  it("requires a prompt", () => {
    expect(validateQuestionInput({ prompt: "  ", maxDurationSeconds: 120 })).toContain("prompt");
  });

  it("holds the duration inside the range the schema also enforces", () => {
    expect(validateQuestionInput({ prompt: "x", maxDurationSeconds: 10 })).toContain("between");
    expect(validateQuestionInput({ prompt: "x", maxDurationSeconds: 601 })).toContain("between");
    expect(validateQuestionInput({ prompt: "x", maxDurationSeconds: 120 })).toBeNull();
  });

  it("rejects a non-integer duration rather than silently rounding it", () => {
    expect(validateQuestionInput({ prompt: "x", maxDurationSeconds: 90.5 })).toContain(
      "whole number",
    );
  });
});

describe("reorderPositions", () => {
  const questions = [
    { id: "a", position: 1 },
    { id: "b", position: 2 },
    { id: "c", position: 3 },
  ];

  it("moves a question up and renumbers 1..n", () => {
    expect(reorderPositions(questions, "c", "up")).toEqual([
      { id: "a", position: 1 },
      { id: "c", position: 2 },
      { id: "b", position: 3 },
    ]);
  });

  it("moves a question down", () => {
    expect(reorderPositions(questions, "a", "down")).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
      { id: "c", position: 3 },
    ]);
  });

  it("is a no-op at either end", () => {
    expect(reorderPositions(questions, "a", "up").map((q) => q.id)).toEqual(["a", "b", "c"]);
    expect(reorderPositions(questions, "c", "down").map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores an unknown id", () => {
    expect(reorderPositions(questions, "zzz", "up").map((q) => q.id)).toEqual(["a", "b", "c"]);
  });

  it("repairs gapped positions while it is at it", () => {
    const gapped = [
      { id: "a", position: 1 },
      { id: "b", position: 4 },
    ];
    expect(reorderPositions(gapped, "b", "up")).toEqual([
      { id: "b", position: 1 },
      { id: "a", position: 2 },
    ]);
  });
});
