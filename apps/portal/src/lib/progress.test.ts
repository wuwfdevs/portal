import { describe, expect, it } from "vitest";
import { progressPercent, progressValueText } from "./progress";

describe("progressPercent", () => {
  it("is a share of the total", () => {
    expect(progressPercent(12, 26)).toBeCloseTo(46.15, 2);
    expect(progressPercent(0, 10)).toBe(0);
    expect(progressPercent(10, 10)).toBe(100);
  });

  it("clamps, and is empty when there is no total", () => {
    expect(progressPercent(15, 10)).toBe(100);
    expect(progressPercent(-3, 10)).toBe(0);
    expect(progressPercent(5, 0)).toBe(0);
  });
});

describe("progressValueText", () => {
  it("reads done of total", () => {
    expect(progressValueText({ done: 12, total: 26 })).toBe("12 of 26");
  });

  it("names the pending share when there is one", () => {
    expect(progressValueText({ done: 12, pending: 6, total: 26 })).toBe("12 of 26, plus 6 pending");
    expect(progressValueText({ done: 12, pending: 0, total: 26 })).toBe("12 of 26");
  });

  it("says so when there is nothing to measure", () => {
    expect(progressValueText({ done: 0, total: 0 })).toBe("Nothing to measure");
  });
});
