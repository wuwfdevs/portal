import { describe, expect, it } from "vitest";
import { describeSummary, scheduleState } from "./job-labels";

describe("describeSummary", () => {
  it("reads counts, leaves out zeros and shows a reason", () => {
    expect(describeSummary({ waiting: 3, sent: 2, failed: 1, needs_a_person: 0 })).toBe("3 waiting, 2 sent, 1 failed");
    expect(describeSummary({ skipped: "no mailbox set" })).toBe("no mailbox set");
    expect(describeSummary({ waiting: 2, emailed: true })).toBe("2 waiting, emailed");
    expect(describeSummary(null)).toBe("");
  });
});

describe("scheduleState", () => {
  const now = new Date("2026-11-14T12:00:00Z");
  it("is never with no runs, stale after three hours quiet, failing when a task's latest run failed", () => {
    expect(scheduleState([], now)).toBe("never");
    expect(scheduleState([{ task: "ask-digest", started_at: "2026-11-14T07:00:00Z", ok: true }], now)).toBe("stale");
    expect(
      scheduleState(
        [
          { task: "ask-digest", started_at: "2026-11-14T10:00:00Z", ok: false },
          { task: "ask-digest", started_at: "2026-11-14T11:00:00Z", ok: true },
          { task: "email-after-links", started_at: "2026-11-14T11:00:00Z", ok: false },
        ],
        now,
      ),
    ).toBe("failing");
    expect(scheduleState([{ task: "ask-digest", started_at: "2026-11-14T11:30:00Z", ok: true }], now)).toBe("ok");
  });
});
