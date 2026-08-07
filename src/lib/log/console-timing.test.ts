import { describe, expect, it } from "vitest";
import { computeLiveTimingState, type ConsoleItemLike } from "./console-timing";

function item(overrides: Partial<ConsoleItemLike> & { id: string; scheduled_at: string }): ConsoleItemLike {
  return {
    planned_duration_seconds: 60,
    requirement_level: "required",
    confirmed: false,
    ...overrides,
  };
}

const SHIFT_END = "2026-08-07T12:00:00.000Z";

describe("computeLiveTimingState", () => {
  it("is on_time with no current item yet (before the first one starts)", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:00.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T09:30:00.000Z" })],
      SHIFT_END,
    );
    expect(result.state).toBe("on_time");
    expect(result.currentItem).toBeNull();
    expect(result.nextItem?.id).toBe("a");
  });

  it("is on_time squarely inside an unconfirmed item's window", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:20.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T09:00:00.000Z", planned_duration_seconds: 60 })],
      SHIFT_END,
    );
    expect(result.state).toBe("on_time");
    expect(result.secondsRemainingInCurrent).toBe(40);
  });

  it("is running_long once an unconfirmed item's window has elapsed past the risk threshold", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:02:30.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T09:00:00.000Z", planned_duration_seconds: 60 })],
      SHIFT_END,
    );
    expect(result.state).toBe("running_long");
  });

  it("is running_short once a confirmed item still has meaningful time left in its window", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:10.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T09:00:00.000Z", planned_duration_seconds: 60, confirmed: true })],
      SHIFT_END,
    );
    expect(result.state).toBe("running_short");
  });

  it("is at_risk_required when the next required item is imminent and the current one is unconfirmed", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:50.000Z",
      [
        item({ id: "a", scheduled_at: "2026-08-07T09:00:00.000Z", planned_duration_seconds: 60 }),
        item({ id: "b", scheduled_at: "2026-08-07T09:01:30.000Z", requirement_level: "required" }),
      ],
      SHIFT_END,
    );
    expect(result.state).toBe("at_risk_required");
  });

  it("is not at_risk_required when the imminent next item is only optional", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:50.000Z",
      [
        item({ id: "a", scheduled_at: "2026-08-07T09:00:00.000Z", planned_duration_seconds: 60 }),
        item({ id: "b", scheduled_at: "2026-08-07T09:01:30.000Z", requirement_level: "optional" }),
      ],
      SHIFT_END,
    );
    expect(result.state).not.toBe("at_risk_required");
  });

  it("is at_risk_rejoin when the last item is unconfirmed and rejoin is imminent", () => {
    const result = computeLiveTimingState(
      "2026-08-07T11:59:30.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T11:59:00.000Z" })],
      SHIFT_END,
    );
    expect(result.state).toBe("at_risk_rejoin");
  });

  it("is not at_risk_rejoin once the last item is confirmed", () => {
    const result = computeLiveTimingState(
      "2026-08-07T11:59:30.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T11:59:00.000Z", confirmed: true })],
      SHIFT_END,
    );
    expect(result.state).not.toBe("at_risk_rejoin");
  });

  it("prioritizes at_risk_rejoin over running_long when both would otherwise apply", () => {
    const result = computeLiveTimingState(
      "2026-08-07T11:59:50.000Z",
      [item({ id: "a", scheduled_at: "2026-08-07T11:57:00.000Z", planned_duration_seconds: 60 })],
      SHIFT_END,
    );
    expect(result.state).toBe("at_risk_rejoin");
  });
});
