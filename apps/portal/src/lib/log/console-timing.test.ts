import { describe, expect, it } from "vitest";
import {
  findCurrentBreak,
  liveRefreshInstants,
  nextRefreshDelayMs,
  MIN_REFRESH_DELAY_MS,
  REFRESH_GRACE_MS,
  selectRejoinWidgetTarget,
  type ConsoleBreakLike,
  type RejoinWidgetBreak,
} from "./console-timing";

const SHIFT_END = "2026-08-07T12:00:00.000Z";

describe("findCurrentBreak", () => {
  const breaks: ConsoleBreakLike[] = [
    // Deliberately out of order — the function sorts.
    {
      id: "b",
      scheduled_at: "2026-08-07T09:10:00.000Z",
      network_rejoin_at: "2026-08-07T09:11:00.000Z",
    },
    {
      id: "a",
      scheduled_at: "2026-08-07T09:00:00.000Z",
      network_rejoin_at: "2026-08-07T09:01:00.000Z",
    },
  ];

  it("has no current break before the first one starts", () => {
    const result = findCurrentBreak("2026-08-07T08:59:59.000Z", breaks);
    expect(result.currentBreak).toBeNull();
    expect(result.nextBreak?.id).toBe("a");
  });

  it("is the most recently started break, from its start instant on", () => {
    expect(findCurrentBreak("2026-08-07T09:00:00.000Z", breaks).currentBreak?.id).toBe("a");
    const between = findCurrentBreak("2026-08-07T09:05:00.000Z", breaks);
    expect(between.currentBreak?.id).toBe("a");
    expect(between.nextBreak?.id).toBe("b");
    const last = findCurrentBreak("2026-08-07T11:00:00.000Z", breaks);
    expect(last.currentBreak?.id).toBe("b");
    expect(last.nextBreak).toBeNull();
  });
});

describe("liveRefreshInstants", () => {
  it("lists each break's start and rejoin plus the shift end, sorted and deduplicated", () => {
    const instants = liveRefreshInstants(
      [
        { scheduled_at: "2026-08-07T09:00:00.000Z", network_rejoin_at: "2026-08-07T09:02:00.000Z" },
        // Starts exactly at the previous break's rejoin — that instant appears once.
        { scheduled_at: "2026-08-07T09:02:00.000Z", network_rejoin_at: "2026-08-07T09:03:00.000Z" },
      ],
      "2026-08-07T10:00:00.000Z",
    );
    expect(instants).toEqual([
      "2026-08-07T09:00:00.000Z",
      "2026-08-07T09:02:00.000Z",
      "2026-08-07T09:03:00.000Z",
      "2026-08-07T10:00:00.000Z",
    ]);
  });

  it("covers every instant the current break or the countdown's target changes", () => {
    const breaks = [
      {
        id: "a",
        scheduled_at: "2026-08-07T09:00:00.000Z",
        network_rejoin_at: "2026-08-07T09:02:00.000Z",
      },
      {
        id: "b",
        scheduled_at: "2026-08-07T09:10:00.000Z",
        network_rejoin_at: "2026-08-07T09:11:00.000Z",
      },
    ];
    const widgetBreaks = breaks.map((brk) => ({
      ...brk,
      hasLocalContent: true,
      receivesSpillover: false,
    }));
    const ms = liveRefreshInstants(breaks, SHIFT_END).map((iso) => new Date(iso).getTime());
    // Between any two consecutive instants the state must be constant:
    // sample just after each instant and just before the next one.
    for (let i = 0; i < ms.length - 1; i++) {
      const early = new Date(ms[i]! + 1).toISOString();
      const late = new Date(ms[i + 1]! - 1).toISOString();
      expect(findCurrentBreak(late, breaks).currentBreak?.id ?? null).toBe(
        findCurrentBreak(early, breaks).currentBreak?.id ?? null,
      );
      expect(selectRejoinWidgetTarget(late, widgetBreaks, SHIFT_END)).toEqual(
        selectRejoinWidgetTarget(early, widgetBreaks, SHIFT_END),
      );
    }
  });

  it("returns only the shift end for a rundown with no breaks", () => {
    expect(liveRefreshInstants([], "2026-08-07T10:00:00.000Z")).toEqual([
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

describe("selectRejoinWidgetTarget", () => {
  function wb(
    overrides: Partial<RejoinWidgetBreak> & {
      id: string;
      scheduled_at: string;
      network_rejoin_at: string;
    },
  ): RejoinWidgetBreak {
    return { hasLocalContent: true, receivesSpillover: false, ...overrides };
  }

  // 2026-09-24's Morning Edition, 8:00–8:21 CDT: two filled underwriting
  // breaks with a network-only stretch between them, then an empty promo.
  const morning = [
    wb({
      id: "uw806",
      scheduled_at: "2026-09-24T13:06:00.000Z",
      network_rejoin_at: "2026-09-24T13:07:30.000Z",
    }),
    wb({
      id: "uw819",
      scheduled_at: "2026-09-24T13:19:00.000Z",
      network_rejoin_at: "2026-09-24T13:20:30.000Z",
    }),
    wb({
      id: "fa-promo",
      scheduled_at: "2026-09-24T13:20:30.000Z",
      network_rejoin_at: "2026-09-24T13:21:00.000Z",
      hasLocalContent: false,
    }),
  ];
  const SHIFT = "2026-09-24T14:00:00.000Z";

  it("counts down to the airing break's rejoin while it is airing", () => {
    expect(selectRejoinWidgetTarget("2026-09-24T13:07:00.000Z", morning, SHIFT)).toEqual({
      kind: "rejoin",
      airingBreakId: "uw806",
      finalBreakId: "uw806",
      targetISO: "2026-09-24T13:07:30.000Z",
    });
  });

  it("moves to the next break once the airing break's rejoin has passed, not when the next break starts", () => {
    // 8:10 — three minutes after the 8:07:30 rejoin.
    expect(selectRejoinWidgetTarget("2026-09-24T13:10:00.000Z", morning, SHIFT)).toEqual({
      kind: "next_break",
      breakId: "uw819",
      targetISO: "2026-09-24T13:19:00.000Z",
    });
    // Exactly at the rejoin instant, the network is already back.
    expect(selectRejoinWidgetTarget("2026-09-24T13:07:30.000Z", morning, SHIFT).kind).toBe(
      "next_break",
    );
  });

  it("points at the first break before anything has started", () => {
    expect(selectRejoinWidgetTarget("2026-09-24T13:00:00.000Z", morning, SHIFT)).toMatchObject({
      kind: "next_break",
      breakId: "uw806",
    });
  });

  it("skips empty breaks when looking for the next one", () => {
    const breaks = [
      wb({
        id: "empty",
        scheduled_at: "2026-09-24T13:00:00.000Z",
        network_rejoin_at: "2026-09-24T13:01:00.000Z",
        hasLocalContent: false,
      }),
      wb({
        id: "empty2",
        scheduled_at: "2026-09-24T13:02:00.000Z",
        network_rejoin_at: "2026-09-24T13:03:00.000Z",
        hasLocalContent: false,
      }),
      wb({
        id: "filled",
        scheduled_at: "2026-09-24T13:05:00.000Z",
        network_rejoin_at: "2026-09-24T13:06:00.000Z",
      }),
    ];
    expect(selectRejoinWidgetTarget("2026-09-24T13:00:30.000Z", breaks, SHIFT)).toMatchObject({
      kind: "next_break",
      breakId: "filled",
    });
  });

  it("extends the rejoin through a spillover chain, from its head or from a covered break", () => {
    const breaks = [
      wb({
        id: "head",
        scheduled_at: "2026-09-24T13:00:00.000Z",
        network_rejoin_at: "2026-09-24T13:01:00.000Z",
      }),
      wb({
        id: "covered",
        scheduled_at: "2026-09-24T13:01:00.000Z",
        network_rejoin_at: "2026-09-24T13:02:00.000Z",
        receivesSpillover: true,
      }),
      wb({
        id: "later",
        scheduled_at: "2026-09-24T13:10:00.000Z",
        network_rejoin_at: "2026-09-24T13:11:00.000Z",
      }),
    ];
    expect(selectRejoinWidgetTarget("2026-09-24T13:00:30.000Z", breaks, SHIFT)).toEqual({
      kind: "rejoin",
      airingBreakId: "head",
      finalBreakId: "covered",
      targetISO: "2026-09-24T13:02:00.000Z",
    });
    expect(selectRejoinWidgetTarget("2026-09-24T13:01:30.000Z", breaks, SHIFT)).toMatchObject({
      kind: "rejoin",
      airingBreakId: "covered",
      targetISO: "2026-09-24T13:02:00.000Z",
    });
    expect(selectRejoinWidgetTarget("2026-09-24T13:03:00.000Z", breaks, SHIFT)).toMatchObject({
      kind: "next_break",
      breakId: "later",
    });
  });

  it("falls back to the shift's end once no local content is left", () => {
    expect(selectRejoinWidgetTarget("2026-09-24T13:25:00.000Z", morning, SHIFT)).toEqual({
      kind: "shift_end",
      targetISO: SHIFT,
    });
    expect(selectRejoinWidgetTarget("2026-09-24T13:25:00.000Z", [], SHIFT).kind).toBe("shift_end");
  });
});
