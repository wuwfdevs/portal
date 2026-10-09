import { describe, expect, it } from "vitest";
import { formatDollars, formatShare, roundCents, roundTo, roundUpTo } from "./money";

describe("rounding", () => {
  it("rounds to cents with the epsilon nudge", () => {
    expect(roundCents(154.505)).toBe(154.51);
    expect(roundCents(1.005)).toBe(1.01);
  });

  it("rounds to a number of places", () => {
    expect(roundTo(2.345, 2)).toBe(2.35);
    expect(roundTo(7.46, 1)).toBe(7.5);
    expect(roundTo(7.5, 0)).toBe(8);
  });

  it("rounds up to the card step and leaves a figure already on a step", () => {
    expect(roundUpTo(1101)).toBe(1125);
    expect(roundUpTo(1125)).toBe(1125);
    expect(roundUpTo(0.01)).toBe(25);
    expect(() => roundUpTo(10, 0)).toThrow();
  });
});

describe("formatting", () => {
  it("prints dollars with cents only when they matter", () => {
    expect(formatDollars(1150)).toBe("$1,150");
    expect(formatDollars(46.17)).toBe("$46.17");
    expect(formatDollars(1150, { cents: true })).toBe("$1,150.00");
  });

  it("prints shares", () => {
    expect(formatShare(0.35)).toBe("35%");
    expect(formatShare(0.0671)).toBe("6.71%");
  });
});
