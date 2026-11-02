import { describe, expect, it } from "vitest";
import { safeLocalPath } from "./safe-path";

describe("safeLocalPath", () => {
  it("keeps an ordinary local path, query and all", () => {
    expect(safeLocalPath("/dashboard", "/x")).toBe("/dashboard");
    expect(safeLocalPath("/log/rundowns/1?tab=a#top", "/x")).toBe("/log/rundowns/1?tab=a#top");
  });

  it("falls back for empty and missing values", () => {
    expect(safeLocalPath(null, "/x")).toBe("/x");
    expect(safeLocalPath(undefined, "/x")).toBe("/x");
    expect(safeLocalPath("", "/x")).toBe("/x");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "@evil.com",
      "evil.com",
      "https://evil.com",
      "//evil.com",
      "/\\evil.com",
      "/\tevil.com",
      "/a\nb",
      "javascript:alert(1)",
    ]) {
      expect(safeLocalPath(bad, "/x")).toBe("/x");
    }
  });

  it("restricts to prefixes on a path boundary", () => {
    const prefixes = ["/bookings/calendar"];
    expect(safeLocalPath("/bookings/calendar", "/x", { prefixes })).toBe("/bookings/calendar");
    expect(safeLocalPath("/bookings/calendar?view=month", "/x", { prefixes })).toBe(
      "/bookings/calendar?view=month",
    );
    expect(safeLocalPath("/bookings/calendar/plan", "/x", { prefixes })).toBe(
      "/bookings/calendar/plan",
    );
    expect(safeLocalPath("/bookings/calendarX", "/x", { prefixes })).toBe("/x");
    expect(safeLocalPath("/bookings/other", "/x", { prefixes })).toBe("/x");
  });
});
