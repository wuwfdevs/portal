import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatClock,
  formatClockMs,
  formatShortDate,
  formatShortDateTime,
  formatUsd,
} from "./format";

describe("formatBytes", () => {
  it("scales units", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
  });
});

describe("formatClock", () => {
  it("uses m:ss under an hour and h:mm:ss beyond", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(3725)).toBe("1:02:05");
    expect(formatClockMs(90_000)).toBe("1:30");
  });
  it("clamps negatives to zero", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("dates and money", () => {
  it("formats short dates", () => {
    expect(formatShortDate("2026-10-07T12:00:00Z")).toBe("Oct 7");
    expect(formatShortDate("2026-10-07T12:00:00Z", { year: true })).toBe("Oct 7, 2026");
    expect(formatShortDateTime("2026-10-07T12:00:00")).toMatch(/Oct 7, 12:00/);
  });
  it("formats whole dollars", () => {
    expect(formatUsd(1150)).toBe("$1,150");
  });
});
