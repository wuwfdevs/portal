import { describe, expect, it } from "vitest";
import {
  constraintTier,
  isFixedPosition,
  orderLinesForFill,
  windowWidthMinutes,
  type FillOrderLineLike,
} from "./fill-order";

interface Line extends FillOrderLineLike {
  id: string;
}

function line(id: string, overrides: Partial<Omit<Line, "id">> & Pick<Line, "time_mode">): Line {
  return {
    id,
    window_start: null,
    window_end: null,
    service_level: "guaranteed",
    ...overrides,
  };
}

describe("constraintTier", () => {
  it("ranks exact, opening and closing as fixed positions ahead of everything else", () => {
    expect(constraintTier({ time_mode: "exact" })).toBe(0);
    expect(constraintTier({ time_mode: "opening" })).toBe(0);
    expect(constraintTier({ time_mode: "closing" })).toBe(0);
    expect(constraintTier({ time_mode: "window" })).toBe(1);
    expect(constraintTier({ time_mode: "preferred" })).toBe(2);
    expect(constraintTier({ time_mode: "any" })).toBe(3);
    expect(isFixedPosition({ time_mode: "closing" })).toBe(true);
    expect(isFixedPosition({ time_mode: "preferred" })).toBe(false);
  });

  it("measures a window's width and treats other modes as unbounded", () => {
    expect(
      windowWidthMinutes({ time_mode: "window", window_start: "06:00", window_end: "09:00" }),
    ).toBe(180);
    expect(
      windowWidthMinutes({ time_mode: "window", window_start: "06:00:00", window_end: "06:30:00" }),
    ).toBe(30);
    expect(
      windowWidthMinutes({ time_mode: "any", window_start: null, window_end: null }),
    ).toBeNull();
    expect(
      windowWidthMinutes({ time_mode: "window", window_start: "09:00", window_end: "06:00" }),
    ).toBeNull();
  });
});

describe("orderLinesForFill", () => {
  it("fills fixed positions, then windows narrowest first, then preferred, then any", () => {
    const lines = [
      line("any", { time_mode: "any" }),
      line("wide", { time_mode: "window", window_start: "05:00", window_end: "12:00" }),
      line("preferred", { time_mode: "preferred" }),
      line("exact", { time_mode: "exact" }),
      line("narrow", { time_mode: "window", window_start: "07:00", window_end: "08:00" }),
      line("opening", { time_mode: "opening" }),
    ];
    expect(orderLinesForFill(lines).map((l) => l.id)).toEqual([
      "exact",
      "opening",
      "narrow",
      "wide",
      "preferred",
      "any",
    ]);
  });

  it("puts guaranteed before bonus within a tier, then the line with fewer candidate breaks", () => {
    const lines = [
      line("bonus-few", { time_mode: "any", service_level: "bonus" }),
      line("guaranteed-many", { time_mode: "any" }),
      line("guaranteed-few", { time_mode: "any" }),
      line("bonus-many", { time_mode: "any", service_level: "bonus" }),
    ];
    const counts: Record<string, number> = {
      "bonus-few": 2,
      "guaranteed-many": 40,
      "guaranteed-few": 3,
      "bonus-many": 50,
    };
    expect(orderLinesForFill(lines, (l) => counts[l.id] ?? null).map((l) => l.id)).toEqual([
      "guaranteed-few",
      "guaranteed-many",
      "bonus-few",
      "bonus-many",
    ]);
  });

  it("keeps the given order for lines it cannot tell apart, and sorts an unknown candidate count last", () => {
    const lines = [
      line("first", { time_mode: "preferred" }),
      line("second", { time_mode: "preferred" }),
      line("known", { time_mode: "preferred" }),
    ];
    expect(orderLinesForFill(lines, (l) => (l.id === "known" ? 5 : null)).map((l) => l.id)).toEqual(
      ["known", "first", "second"],
    );
  });
});
