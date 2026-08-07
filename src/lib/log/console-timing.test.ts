import { describe, expect, it } from "vitest";
import { computeLiveTimingState, type ConsoleBreakLike } from "./console-timing";

function brk(overrides: Partial<ConsoleBreakLike> & { id: string; scheduled_at: string }): ConsoleBreakLike {
  return {
    network_rejoin_at: overrides.scheduled_at,
    requirement: "optional",
    itemCount: 1,
    allItemsConfirmed: false,
    ...overrides,
  };
}

const SHIFT_END = "2026-08-07T12:00:00.000Z";

describe("computeLiveTimingState", () => {
  it("is on_time with no current break yet (before the first one starts)", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:00.000Z",
      [brk({ id: "a", scheduled_at: "2026-08-07T09:30:00.000Z" })],
      SHIFT_END,
    );
    expect(result.state).toBe("on_time");
    expect(result.currentBreak).toBeNull();
    expect(result.nextBreak?.id).toBe("a");
  });

  it("is on_time squarely inside an unconfirmed break's window", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:20.000Z",
      [
        brk({
          id: "a",
          scheduled_at: "2026-08-07T09:00:00.000Z",
          network_rejoin_at: "2026-08-07T09:01:00.000Z",
        }),
      ],
      SHIFT_END,
    );
    expect(result.state).toBe("on_time");
    expect(result.secondsRemainingInCurrent).toBe(40);
  });

  it("is running_long once a filled, unconfirmed break's window has elapsed past the risk threshold", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:02:30.000Z",
      [
        brk({
          id: "a",
          scheduled_at: "2026-08-07T09:00:00.000Z",
          network_rejoin_at: "2026-08-07T09:01:00.000Z",
        }),
      ],
      SHIFT_END,
    );
    expect(result.state).toBe("running_long");
  });

  it("is running_short once a confirmed break still has meaningful time left before rejoin", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:10.000Z",
      [
        brk({
          id: "a",
          scheduled_at: "2026-08-07T09:00:00.000Z",
          network_rejoin_at: "2026-08-07T09:01:00.000Z",
          allItemsConfirmed: true,
        }),
      ],
      SHIFT_END,
    );
    expect(result.state).toBe("running_short");
  });

  it("is at_risk_required when a required, still-empty break's own rejoin is imminent", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:05.000Z",
      [
        brk({
          id: "a",
          scheduled_at: "2026-08-07T09:00:00.000Z",
          network_rejoin_at: "2026-08-07T09:01:00.000Z",
          requirement: "required",
          itemCount: 0,
        }),
      ],
      SHIFT_END,
    );
    expect(result.state).toBe("at_risk_required");
  });

  it("is not at_risk_required for an empty optional break — carrying network is fine", () => {
    const result = computeLiveTimingState(
      "2026-08-07T09:00:05.000Z",
      [
        brk({
          id: "a",
          scheduled_at: "2026-08-07T09:00:00.000Z",
          network_rejoin_at: "2026-08-07T09:01:00.000Z",
          requirement: "optional",
          itemCount: 0,
        }),
      ],
      SHIFT_END,
    );
    expect(result.state).not.toBe("at_risk_required");
  });

  it("is at_risk_rejoin when the last break is unresolved and shift rejoin is imminent", () => {
    const result = computeLiveTimingState(
      "2026-08-07T11:59:30.000Z",
      [brk({ id: "a", scheduled_at: "2026-08-07T11:59:00.000Z" })],
      SHIFT_END,
    );
    expect(result.state).toBe("at_risk_rejoin");
  });

  it("is not at_risk_rejoin once the last break is fully confirmed", () => {
    const result = computeLiveTimingState(
      "2026-08-07T11:59:30.000Z",
      [brk({ id: "a", scheduled_at: "2026-08-07T11:59:00.000Z", allItemsConfirmed: true })],
      SHIFT_END,
    );
    expect(result.state).not.toBe("at_risk_rejoin");
  });

  it("prioritizes at_risk_rejoin over running_long when both would otherwise apply", () => {
    const result = computeLiveTimingState(
      "2026-08-07T11:59:50.000Z",
      [
        brk({
          id: "a",
          scheduled_at: "2026-08-07T11:57:00.000Z",
          network_rejoin_at: "2026-08-07T11:58:00.000Z",
        }),
      ],
      SHIFT_END,
    );
    expect(result.state).toBe("at_risk_rejoin");
  });
});
