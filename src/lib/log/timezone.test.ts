import { describe, expect, it } from "vitest";
import {
  formatStationDateLong,
  formatStationTimestamp,
  stationLocalDateTimeToUTC,
  stationTodayISO,
} from "./timezone";

describe("stationTodayISO", () => {
  it("stays on the same calendar day for a Central-time morning instant", () => {
    // 2026-08-07 10:00 UTC = 2026-08-07 05:00 CDT.
    expect(stationTodayISO("2026-08-07T10:00:00.000Z")).toBe("2026-08-07");
  });

  it("does not roll to tomorrow in the evening the way a bare UTC slice would", () => {
    // 2026-08-08 02:00 UTC = 2026-08-07 21:00 CDT — still "today" in Pensacola,
    // even though new Date().toISOString().slice(0, 10) would already say 08-08.
    expect(stationTodayISO("2026-08-08T02:00:00.000Z")).toBe("2026-08-07");
  });
});

describe("formatStationDateLong", () => {
  it("formats a plain calendar date without shifting it", () => {
    expect(formatStationDateLong("2026-08-07")).toBe("Friday, August 7");
  });
});

describe("formatStationTimestamp", () => {
  it("renders in Central time, not the ambient/UTC timezone", () => {
    // 2026-08-07 11:27 UTC = 2026-08-07 06:27 CDT — the exact case that
    // prompted this fix: the weather screen showed 11:27 while it was 6:27
    // in Pensacola.
    const result = formatStationTimestamp("2026-08-07T11:27:00.000Z");
    expect(result).toContain("6:27");
    expect(result).not.toContain("11:27");
  });
});

describe("stationLocalDateTimeToUTC", () => {
  it("applies the CDT offset (UTC-5) in August", () => {
    // 9:00 AM in Pensacola on August 7 (CDT) is 14:00 UTC.
    expect(stationLocalDateTimeToUTC("2026-08-07", "09:00:00")).toBe("2026-08-07T14:00:00.000Z");
  });

  it("applies the CST offset (UTC-6) in January", () => {
    // 9:00 AM in Pensacola on January 7 (CST) is 15:00 UTC.
    expect(stationLocalDateTimeToUTC("2026-01-07", "09:00:00")).toBe("2026-01-07T15:00:00.000Z");
  });

  it("rolls the calendar date forward when the local time is late enough", () => {
    // 11:00 PM CDT on August 7 is already August 8 in UTC.
    expect(stationLocalDateTimeToUTC("2026-08-07", "23:00:00")).toBe("2026-08-08T04:00:00.000Z");
  });
});
