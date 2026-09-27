import { describe, expect, it } from "vitest";
import {
  cycleOrder,
  nextInRotation,
  walkRotation,
  type RotationCopy,
  type RotationSlot,
} from "./rotation";

function copy(id: string, overrides: Partial<RotationCopy> = {}): RotationCopy {
  return {
    id,
    approvalStatus: "approved",
    durationSeconds: 30,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    flightId: null,
    createdAt: `2026-01-01T00:00:0${id.charCodeAt(0) - 96}Z`,
    ...overrides,
  };
}

let counter = 0;
function slot(scheduledAt: string, overrides: Partial<RotationSlot> = {}): RotationSlot {
  counter++;
  return {
    id: overrides.id ?? `slot-${counter}`,
    scheduledAt,
    airDate: scheduledAt.slice(0, 10),
    lineFlightId: null,
    copyId: null,
    fixed: false,
    roomSeconds: 90,
    ...overrides,
  };
}

const A = copy("a");
const B = copy("b");
const C = copy("c");

describe("cycleOrder", () => {
  it("is the Copy tab's order: created_at, then id", () => {
    expect(cycleOrder([C, A, B]).map((c) => c.id)).toEqual(["a", "b", "c"]);
    const tie = copy("z", { createdAt: A.createdAt });
    expect(cycleOrder([tie, A]).map((c) => c.id)).toEqual(["a", "z"]);
  });
});

describe("nextInRotation", () => {
  const anySlot = { airDate: "2026-03-02", lineFlightId: null, roomSeconds: 90 };

  it("takes the message after the previous one, wrapping", () => {
    expect(nextInRotation([A, B, C], "a", anySlot)?.id).toBe("b");
    expect(nextInRotation([A, B, C], "c", anySlot)?.id).toBe("a");
  });

  it("starts from the top with no previous message, or one no longer linked", () => {
    expect(nextInRotation([A, B], null, anySlot)?.id).toBe("a");
    expect(nextInRotation([A, B], "gone", anySlot)?.id).toBe("a");
  });

  it("skips a draft, out-of-date, wrong-flight or too-long message", () => {
    const draft = copy("b", { approvalStatus: "draft" });
    expect(nextInRotation([A, draft, C], "a", anySlot)?.id).toBe("c");
    const later = copy("b", { effectiveFrom: "2026-06-01" });
    expect(nextInRotation([A, later, C], "a", anySlot)?.id).toBe("c");
    const ended = copy("b", { effectiveTo: "2026-02-01" });
    expect(nextInRotation([A, ended, C], "a", anySlot)?.id).toBe("c");
    const flighted = copy("b", { flightId: "flight-x" });
    expect(nextInRotation([A, flighted, C], "a", anySlot)?.id).toBe("c");
    expect(
      nextInRotation([A, flighted, C], "a", { ...anySlot, lineFlightId: "flight-x" })?.id,
    ).toBe("b");
    const long = copy("b", { durationSeconds: 120 });
    expect(nextInRotation([A, long, C], "a", anySlot)?.id).toBe("c");
  });

  it("returns null when nothing is eligible", () => {
    expect(nextInRotation([copy("a", { approvalStatus: "draft" })], null, anySlot)).toBeNull();
    expect(nextInRotation([], null, anySlot)).toBeNull();
  });

  it("prefers a message different from the fixed one that follows, when there is a choice", () => {
    expect(nextInRotation([A, B, C], "a", anySlot, "b")?.id).toBe("c");
    // Two messages: no choice — the double is unavoidable.
    expect(nextInRotation([A, B], "a", anySlot, "b")?.id).toBe("b");
  });
});

describe("walkRotation", () => {
  it("alternates two messages in air order across two lines", () => {
    const slots = [
      slot("2026-03-02T13:49:00Z", { id: "mon1", lineFlightId: null }),
      slot("2026-03-04T14:06:00Z", { id: "wed1" }),
      slot("2026-03-05T14:06:00Z", { id: "thu1" }),
      slot("2026-03-09T13:49:00Z", { id: "mon2" }),
      slot("2026-03-11T14:06:00Z", { id: "wed2" }),
    ];
    // Given out of order, sorted by the walk.
    const changes = walkRotation([B, A], [slots[3]!, slots[0]!, slots[4]!, slots[1]!, slots[2]!]);
    expect(changes).toEqual([
      { id: "mon1", copyId: "a" },
      { id: "wed1", copyId: "b" },
      { id: "thu1", copyId: "a" },
      { id: "mon2", copyId: "b" },
      { id: "wed2", copyId: "a" },
    ]);
  });

  it("cycles three messages", () => {
    const slots = ["02", "03", "04", "05"].map((day, i) =>
      slot(`2026-03-${day}T13:00:00Z`, { id: `s${i}` }),
    );
    expect(walkRotation([A, B, C], slots).map((c) => c.copyId)).toEqual(["a", "b", "c", "a"]);
  });

  it("re-sequences after an insertion between existing placements", () => {
    // Existing, unfixed: Mon A, Wed B, Fri A. A makegood lands on Tue.
    const slots = [
      slot("2026-03-02T13:00:00Z", { id: "mon", copyId: "a" }),
      slot("2026-03-03T13:00:00Z", { id: "tue", copyId: null }),
      slot("2026-03-04T13:00:00Z", { id: "wed", copyId: "b" }),
      slot("2026-03-06T13:00:00Z", { id: "fri", copyId: "a" }),
    ];
    expect(walkRotation([A, B], slots)).toEqual([
      { id: "tue", copyId: "b" },
      { id: "wed", copyId: "a" },
      { id: "fri", copyId: "b" },
    ]);
  });

  it("never changes a fixed slot but advances the cycle from it", () => {
    const slots = [
      slot("2026-03-02T13:00:00Z", { id: "aired", copyId: "a", fixed: true }),
      slot("2026-03-03T13:00:00Z", { id: "next", copyId: "a" }),
      slot("2026-03-04T13:00:00Z", { id: "override", copyId: "a", fixed: true }),
      slot("2026-03-05T13:00:00Z", { id: "after", copyId: "a" }),
    ];
    expect(walkRotation([A, B], slots)).toEqual([
      { id: "next", copyId: "b" },
      { id: "after", copyId: "b" },
    ]);
  });

  it("looks ahead to a fixed slot so a third message avoids a double where possible", () => {
    const slots = [
      slot("2026-03-02T13:00:00Z", { id: "mon", copyId: "a", fixed: true }),
      slot("2026-03-03T13:00:00Z", { id: "tue", copyId: null }),
      slot("2026-03-04T13:00:00Z", { id: "wed", copyId: "b", fixed: true }),
    ];
    expect(walkRotation([A, B, C], slots)).toEqual([{ id: "tue", copyId: "c" }]);
  });

  it("joins a message from its first effective date", () => {
    const seasonal = copy("c", { effectiveFrom: "2026-03-04" });
    const slots = ["02", "03", "04", "05", "06"].map((day, i) =>
      slot(`2026-03-${day}T13:00:00Z`, { id: `s${i}` }),
    );
    expect(walkRotation([A, B, seasonal], slots).map((c) => c.copyId)).toEqual([
      "a",
      "b",
      "c",
      "a",
      "b",
    ]);
  });

  it("restarts from the first message when the previous one is no longer linked", () => {
    const slots = [
      slot("2026-03-02T13:00:00Z", { id: "old", copyId: "retired-and-unlinked", fixed: true }),
      slot("2026-03-03T13:00:00Z", { id: "next", copyId: "b" }),
    ];
    expect(walkRotation([A, B], slots)).toEqual([{ id: "next", copyId: "a" }]);
  });

  it("keeps a slot's copy when nothing is eligible, and still advances from it", () => {
    const slots = [
      slot("2026-03-02T13:00:00Z", { id: "tight", copyId: "a", roomSeconds: 10 }),
      slot("2026-03-03T13:00:00Z", { id: "next", copyId: "a" }),
    ];
    expect(walkRotation([A, B], slots)).toEqual([{ id: "next", copyId: "b" }]);
  });

  it("lists only the slots whose message actually changes", () => {
    const slots = [
      slot("2026-03-02T13:00:00Z", { id: "s1", copyId: "a" }),
      slot("2026-03-03T13:00:00Z", { id: "s2", copyId: "b" }),
      slot("2026-03-04T13:00:00Z", { id: "s3", copyId: "b" }),
    ];
    expect(walkRotation([A, B], slots)).toEqual([{ id: "s3", copyId: "a" }]);
  });
});
