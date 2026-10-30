import { describe, expect, it } from "vitest";
import {
  applyPendingRelocations,
  clampOccurredAt,
  isDeployMismatchError,
  MAX_OCCURRED_AT_AGE_MS,
  pendingOutcomeByItem,
  retryDelayMs,
  sortEntries,
  type QueuedBroadcastAction,
  type QueueEntry,
} from "./broadcast-queue";

const base = { rundownId: "r1", occurredAt: "2026-09-28T11:06:00.000Z" };

function aired(id: string, itemId: string): QueuedBroadcastAction {
  return { ...base, id, itemId, kind: "outcome_aired" };
}
function missed(id: string, itemId: string): QueuedBroadcastAction {
  return { ...base, id, itemId, kind: "outcome_missed", reason: "breaking_news", notes: null };
}

describe("retryDelayMs", () => {
  it("doubles from one second and caps at thirty", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(retryDelayMs)).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000, 30_000,
    ]);
  });

  it("treats zero attempts like the first", () => {
    expect(retryDelayMs(0)).toBe(1_000);
  });
});

describe("sortEntries", () => {
  it("orders by sequence, then id", () => {
    const entry = (id: string, sequence: number): QueueEntry => ({
      action: aired(id, "i"),
      sequence,
      attempts: 0,
      lastError: null,
    });
    expect(
      sortEntries([entry("b", 2), entry("c", 1), entry("a", 2)]).map((e) => e.action.id),
    ).toEqual(["c", "a", "b"]);
  });
});

describe("isDeployMismatchError", () => {
  it("recognizes Next's unknown-action error by name or message", () => {
    const named = new Error("x");
    named.name = "UnrecognizedActionError";
    expect(isDeployMismatchError(named)).toBe(true);
    expect(
      isDeployMismatchError(new Error('Server Action "abc123" was not found on the server.')),
    ).toBe(true);
  });

  it("does not mistake a network failure for one", () => {
    expect(isDeployMismatchError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isDeployMismatchError("nope")).toBe(false);
  });
});

describe("pendingOutcomeByItem", () => {
  it("keeps the last outcome per item", () => {
    const outcomes = pendingOutcomeByItem([missed("1", "a"), aired("2", "b"), aired("3", "a")]);
    expect(outcomes.get("a")).toBe("aired");
    expect(outcomes.get("b")).toBe("aired");
  });

  it("ignores relocations", () => {
    const outcomes = pendingOutcomeByItem([
      { ...base, id: "1", itemId: "a", kind: "relocate_credit", destinationBreakId: "b2" },
    ]);
    expect(outcomes.size).toBe(0);
  });
});

describe("applyPendingRelocations", () => {
  const server = { b1: ["a", "b"], b2: ["c"] };

  it("returns a copy of the server order when nothing is pending", () => {
    const result = applyPendingRelocations(server, []);
    expect(result).toEqual(server);
    expect(result.b1).not.toBe(server.b1);
  });

  it("moves ordinary content to its destination in the stated order", () => {
    const result = applyPendingRelocations(server, [
      {
        ...base,
        id: "1",
        itemId: "a",
        kind: "relocate_item",
        destinationBreakId: "b2",
        orderedItemIds: ["c", "a"],
      },
    ]);
    expect(result).toEqual({ b1: ["b"], b2: ["c", "a"] });
  });

  it("reorders within a break", () => {
    const result = applyPendingRelocations(server, [
      {
        ...base,
        id: "1",
        itemId: "a",
        kind: "relocate_item",
        destinationBreakId: "b1",
        orderedItemIds: ["b", "a"],
      },
    ]);
    expect(result).toEqual({ b1: ["b", "a"], b2: ["c"] });
  });

  it("appends a credit to the end of its destination", () => {
    const result = applyPendingRelocations(server, [
      { ...base, id: "1", itemId: "b", kind: "relocate_credit", destinationBreakId: "b2" },
    ]);
    expect(result).toEqual({ b1: ["a"], b2: ["c", "b"] });
  });

  it("applies several in order", () => {
    const result = applyPendingRelocations(server, [
      {
        ...base,
        id: "1",
        itemId: "a",
        kind: "relocate_item",
        destinationBreakId: "b2",
        orderedItemIds: ["a", "c"],
      },
      {
        ...base,
        id: "2",
        itemId: "a",
        kind: "relocate_item",
        destinationBreakId: "b1",
        orderedItemIds: ["a", "b"],
      },
    ]);
    expect(result).toEqual({ b1: ["a", "b"], b2: ["c"] });
  });

  it("never resurrects an item the server no longer has, and skips a vanished break", () => {
    const result = applyPendingRelocations(server, [
      { ...base, id: "1", itemId: "gone", kind: "relocate_credit", destinationBreakId: "b2" },
      { ...base, id: "2", itemId: "a", kind: "relocate_credit", destinationBreakId: "b9" },
      {
        ...base,
        id: "3",
        itemId: "b",
        kind: "relocate_item",
        destinationBreakId: "b2",
        orderedItemIds: ["gone", "b", "c"],
      },
    ]);
    expect(result).toEqual({ b1: ["a"], b2: ["b", "c"] });
  });
});

describe("clampOccurredAt", () => {
  const now = new Date("2026-09-28T11:20:00.000Z").getTime();

  it("keeps a recent device timestamp", () => {
    expect(clampOccurredAt("2026-09-28T11:06:00.000Z", now)).toBe("2026-09-28T11:06:00.000Z");
  });

  it("falls back to now for missing, unparseable, future, or too-old timestamps", () => {
    const nowISO = new Date(now).toISOString();
    expect(clampOccurredAt(undefined, now)).toBe(nowISO);
    expect(clampOccurredAt("not a date", now)).toBe(nowISO);
    expect(clampOccurredAt("2026-09-28T11:21:00.000Z", now)).toBe(nowISO);
    expect(clampOccurredAt(new Date(now - MAX_OCCURRED_AT_AGE_MS - 1).toISOString(), now)).toBe(
      nowISO,
    );
  });
});
