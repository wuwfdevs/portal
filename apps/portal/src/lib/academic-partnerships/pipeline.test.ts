import { describe, expect, it } from "vitest";
import {
  daysSince,
  dispositionRequiresReason,
  formatDays,
  STAGES,
  validateDispositionInput,
} from "./pipeline";

describe("STAGES", () => {
  it("is the seven-column pipeline in order, with no dispositions mixed in", () => {
    expect(STAGES).toEqual([
      "new",
      "reviewing",
      "meeting_requested",
      "scoping",
      "approved",
      "active",
      "completed",
    ]);
  });
});

describe("dispositionRequiresReason", () => {
  it("requires a reason for the three ways a submission closes early", () => {
    expect(dispositionRequiresReason("deferred")).toBe(true);
    expect(dispositionRequiresReason("declined")).toBe(true);
    expect(dispositionRequiresReason("withdrawn")).toBe(true);
  });

  it("does not require a reason to archive", () => {
    expect(dispositionRequiresReason("archived")).toBe(false);
  });
});

describe("daysSince", () => {
  const now = new Date("2026-08-10T12:00:00Z");

  it("is zero for something that just happened", () => {
    expect(daysSince("2026-08-10T11:00:00Z", now)).toBe(0);
  });

  it("floors partial days", () => {
    expect(daysSince("2026-08-05T13:00:00Z", now)).toBe(4);
  });

  it("never goes negative for a future timestamp", () => {
    expect(daysSince("2026-08-11T12:00:00Z", now)).toBe(0);
  });
});

describe("formatDays", () => {
  it("reads naturally at the small end", () => {
    expect(formatDays(0)).toBe("Today");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(5)).toBe("5 days");
  });
});

describe("validateDispositionInput", () => {
  it("rejects an empty reason for declining", () => {
    expect(validateDispositionInput("declined", "  ")).not.toBeNull();
  });

  it("accepts an empty reason for archiving", () => {
    expect(validateDispositionInput("archived", "")).toBeNull();
  });

  it("accepts a real reason", () => {
    expect(validateDispositionInput("deferred", "Revisit in spring")).toBeNull();
  });
});
