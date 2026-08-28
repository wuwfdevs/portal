import { describe, expect, it } from "vitest";
import { deriveAirDate } from "./program-log-air-date";

describe("deriveAirDate", () => {
  it("reads the date and weekday from a real title row", () => {
    const result = deriveAirDate("Some text\nFriday 8/21/2026 WUWF-FM Program Log\nmore text");
    expect(result.airDate).toBe("2026-08-21");
    expect(result.weekday).toBe("Friday");
    expect(result.warnings).toEqual([]);
  });

  it("returns nulls with no warning when no title row is present", () => {
    const result = deriveAirDate("06:06:00 | 1 | Baptist Healthcare / Copy 1 | 00:30");
    expect(result.airDate).toBeNull();
    expect(result.weekday).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  it("warns when the printed weekday contradicts the date", () => {
    const result = deriveAirDate("Monday 8/21/2026 WUWF-FM Program Log");
    expect(result.airDate).toBe("2026-08-21");
    expect(result.warnings.some((warning) => warning.includes("Friday"))).toBe(true);
  });

  it("tolerates non-breaking spaces between title-row words (a docx extraction artifact)", () => {
    const result = deriveAirDate("Friday 8/21/2026 WUWF-FM Program Log");
    expect(result.airDate).toBe("2026-08-21");
    expect(result.weekday).toBe("Friday");
  });
});
