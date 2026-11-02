import { describe, expect, it } from "vitest";
import { minutesToHHMM, parseTimeToMinutes } from "./time-of-day";

describe("time of day", () => {
  it("parses HH:MM and HH:MM:SS", () => {
    expect(parseTimeToMinutes("07:49")).toBe(469);
    expect(parseTimeToMinutes("07:49:30")).toBe(469);
    expect(parseTimeToMinutes("24:00")).toBe(1440);
  });
  it("treats a bare hour as on the hour and rejects the unreadable", () => {
    expect(parseTimeToMinutes("9")).toBe(540);
    expect(parseTimeToMinutes("")).toBeNaN();
    expect(parseTimeToMinutes("ab:cd")).toBeNaN();
  });
  it("prints minutes back as HH:MM", () => {
    expect(minutesToHHMM(469)).toBe("07:49");
    expect(minutesToHHMM(0)).toBe("00:00");
  });
});
