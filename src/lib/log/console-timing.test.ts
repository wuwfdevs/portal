import { describe, expect, it } from "vitest";
import {
  computeLiveTimingState,
  liveRefreshInstants,
  nextRefreshDelayMs,
  MIN_REFRESH_DELAY_MS,
  REFRESH_GRACE_MS,
  type ConsoleBreakLike,
} from "./console-timing";

function brk(
  overrides: Partial<ConsoleBreakLike> & { id: string; scheduled_at: string },
): ConsoleBreakLike {
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

describe("liveRefreshInstants", () => {
  it("lists each break's start and rejoin-threshold crossings plus the shift end, sorted and deduplicated", () => {
    const instants = liveRefreshInstants(
      [
        { scheduled_at: "2026-08-07T09:00:00.000Z", network_rejoin_at: "2026-08-07T09:02:00.000Z" },
        // Starts exactly at the previous break's rejoin — that instant appears once.
        { scheduled_at: "2026-08-07T09:02:00.000Z", network_rejoin_at: "2026-08-07T09:03:00.000Z" },
      ],
      "2026-08-07T10:00:00.000Z",
    );
    expect(instants).toEqual([
      "2026-08-07T09:00:00.000Z", // break 1 start
      "2026-08-07T09:01:00.000Z", // rejoin 1 − 60s (at-risk-required)
      "2026-08-07T09:01:30.000Z", // rejoin 1 − 30s (running-short)
      "2026-08-07T09:02:00.000Z", // rejoin 1 / break 2 start (once)
      "2026-08-07T09:02:30.000Z", // rejoin 2 − 30s
      "2026-08-07T09:03:00.000Z", // rejoin 1 + 60s (running-long) / rejoin 2 (once)
      "2026-08-07T09:04:00.000Z", // rejoin 2 + 60s
      "2026-08-07T09:59:00.000Z", // shift end − 60s (at-risk-rejoin)
      "2026-08-07T10:00:00.000Z", // shift end
    ]);
  });

  it("covers every instant the timing state changes across a break's life", () => {
    const breaks = [
      brk({
        id: "a",
        scheduled_at: "2026-08-07T09:00:00.000Z",
        network_rejoin_at: "2026-08-07T09:02:00.000Z",
        requirement: "required",
        itemCount: 0,
      }),
    ];
    const instants = liveRefreshInstants(breaks, SHIFT_END);
    // Between any two consecutive instants the state must be constant: sample
    // just after each instant and just before the next one.
    const ms = instants.map((iso) => new Date(iso).getTime());
    for (let i = 0; i < ms.length - 1; i++) {
      const early = computeLiveTimingState(new Date(ms[i]! + 1).toISOString(), breaks, SHIFT_END);
      const late = computeLiveTimingState(
        new Date(ms[i + 1]! - 1).toISOString(),
        breaks,
        SHIFT_END,
      );
      expect(late.state).toBe(early.state);
      expect(late.currentBreak?.id ?? null).toBe(early.currentBreak?.id ?? null);
    }
    // And the state does change across the at-risk-required boundary.
    expect(computeLiveTimingState("2026-08-07T09:00:59.000Z", breaks, SHIFT_END).state).toBe(
      "on_time",
    );
    expect(computeLiveTimingState("2026-08-07T09:01:01.000Z", breaks, SHIFT_END).state).toBe(
      "at_risk_required",
    );
  });

  it("returns only the shift-end instants for a rundown with no breaks", () => {
    expect(liveRefreshInstants([], "2026-08-07T10:00:00.000Z")).toEqual([
      "2026-08-07T09:59:00.000Z",
      "2026-08-07T10:00:00.000Z",
    ]);
  });
});

describe("nextRefreshDelayMs", () => {
  const now = new Date("2026-08-07T09:00:00.000Z").getTime();

  it("waits until just after the earliest instant still ahead", () => {
    const delay = nextRefreshDelayMs(
      now,
      ["2026-08-07T08:59:00.000Z", "2026-08-07T09:00:45.000Z", "2026-08-07T09:03:00.000Z"],
      5 * 60_000,
    );
    expect(delay).toBe(45_000 + REFRESH_GRACE_MS);
  });

  it("falls back to the interval when no instant is sooner", () => {
    expect(nextRefreshDelayMs(now, ["2026-08-07T09:10:00.000Z"], 5 * 60_000)).toBe(5 * 60_000);
    expect(nextRefreshDelayMs(now, [], 5 * 60_000)).toBe(5 * 60_000);
  });

  it("treats an instant within the grace window as already passed, and never arms below the minimum", () => {
    // 1s ahead: target is 1s + grace = 2.5s, above the 1s floor.
    expect(nextRefreshDelayMs(now, ["2026-08-07T09:00:01.000Z"], 5 * 60_000)).toBe(
      1_000 + REFRESH_GRACE_MS,
    );
    // Exactly now: still armed (now + grace), so a refresh landing on the
    // boundary re-arms once more past it rather than looping.
    expect(nextRefreshDelayMs(now, ["2026-08-07T09:00:00.000Z"], 5 * 60_000)).toBe(
      REFRESH_GRACE_MS,
    );
    // A tiny fallback is floored.
    expect(nextRefreshDelayMs(now, [], 10)).toBe(MIN_REFRESH_DELAY_MS);
  });

  it("ignores an unparseable instant", () => {
    expect(nextRefreshDelayMs(now, ["not a date"], 5 * 60_000)).toBe(5 * 60_000);
  });
});
