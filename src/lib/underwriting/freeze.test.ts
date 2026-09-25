import { describe, expect, it } from "vitest";
import { automationBlockFor, isBreakInPast, isRundownFrozen } from "./freeze";

describe("frozen rundowns", () => {
  it("freezes a rundown that is live or submitted, never a draft or generated one", () => {
    expect(isRundownFrozen("in_progress")).toBe(true);
    expect(isRundownFrozen("submitted")).toBe(true);
    expect(isRundownFrozen("generated")).toBe(false);
    expect(isRundownFrozen("draft")).toBe(false);
  });

  it("treats a break that has started as past, and one still ahead as open", () => {
    const now = "2026-09-25T11:30:00Z";
    expect(isBreakInPast("2026-09-25T11:29:59Z", now)).toBe(true);
    expect(isBreakInPast("2026-09-25T11:30:00Z", now)).toBe(true);
    expect(isBreakInPast("2026-09-25T11:30:01Z", now)).toBe(false);
  });

  it("names the block, rundown status first", () => {
    const now = "2026-09-25T11:30:00Z";
    expect(
      automationBlockFor(
        { rundownStatus: "in_progress", scheduledAt: "2026-09-25T12:00:00Z" },
        now,
      ),
    ).toBe("rundown_frozen");
    expect(
      automationBlockFor({ rundownStatus: "generated", scheduledAt: "2026-09-25T11:00:00Z" }, now),
    ).toBe("break_in_past");
    expect(
      automationBlockFor({ rundownStatus: "generated", scheduledAt: "2026-09-25T12:00:00Z" }, now),
    ).toBeNull();
  });
});
