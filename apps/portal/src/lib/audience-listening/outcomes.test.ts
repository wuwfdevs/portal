import { describe, expect, it } from "vitest";
import { isCalendarDate, normalizeOutcomeUrl, validateOutcomeInput } from "./outcomes";

const GOOD = { kind: "story", title: "What the storm left", url: "https://example.org/story", summary: null, publishedAt: "2026-11-01" };

describe("normalizeOutcomeUrl", () => {
  it("accepts an https address, ignoring spaces around it, and refuses one with spaces inside", () => {
    expect(normalizeOutcomeUrl("  https://example.org/a ")).toBe("https://example.org/a");
    expect(normalizeOutcomeUrl("https://example.org/a b")).toBeNull();
  });

  it("refuses anything that is not a plain https link", () => {
    for (const bad of ["", "example.org", "http://example.org", "javascript:alert(1)", "https://user:pw@example.org/", "//example.org", "https://"]) {
      expect(normalizeOutcomeUrl(bad)).toBeNull();
    }
  });
});

describe("isCalendarDate", () => {
  it("accepts real dates only", () => {
    expect(isCalendarDate("2026-11-09")).toBe(true);
    expect(isCalendarDate("2028-02-29")).toBe(true);
    expect(isCalendarDate("2026-02-31")).toBe(false);
    expect(isCalendarDate("11/09/2026")).toBe(false);
    expect(isCalendarDate("")).toBe(false);
  });
});

describe("validateOutcomeInput", () => {
  it("passes a complete outcome", () => {
    expect(validateOutcomeInput(GOOD)).toBeNull();
    expect(validateOutcomeInput({ ...GOOD, summary: "A short note." })).toBeNull();
  });

  it("names the first thing wrong", () => {
    expect(validateOutcomeInput({ ...GOOD, kind: "ad" })).toMatch(/story, an episode or a report/);
    expect(validateOutcomeInput({ ...GOOD, title: "   " })).toMatch(/title/);
    expect(validateOutcomeInput({ ...GOOD, title: "x".repeat(201) })).toMatch(/200/);
    expect(validateOutcomeInput({ ...GOOD, url: "http://example.org" })).toMatch(/https/);
    expect(validateOutcomeInput({ ...GOOD, publishedAt: "2026-02-31" })).toMatch(/date/);
    expect(validateOutcomeInput({ ...GOOD, summary: "x".repeat(601) })).toMatch(/600/);
  });
});
