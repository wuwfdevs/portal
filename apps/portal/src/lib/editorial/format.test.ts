import { describe, expect, it } from "vitest";
import { formatAgeLong, formatAgo, formatScore } from "./format";

const NOW = new Date("2026-08-18T12:00:00Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

describe("formatAgeLong", () => {
  it("reads as a phrase, singular at one day", () => {
    expect(formatAgeLong(daysAgo(0), NOW)).toBe("today");
    expect(formatAgeLong(daysAgo(1), NOW)).toBe("1 day ago");
    expect(formatAgeLong(daysAgo(12), NOW)).toBe("12 days ago");
  });
});

describe("formatAgo", () => {
  it("stays a sentence fragment rather than '0d ago'", () => {
    expect(formatAgo(daysAgo(0), NOW)).toBe("today");
    expect(formatAgo(daysAgo(12), NOW)).toBe("12d ago");
  });
});

describe("formatScore", () => {
  it("renders one decimal, and null as an em dash", () => {
    expect(formatScore(4)).toBe("4.0");
    expect(formatScore(3.74)).toBe("3.7");
    expect(formatScore(null)).toBe("—");
  });
});
