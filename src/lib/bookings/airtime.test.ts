import { describe, expect, it } from "vitest";
import { airtimeEnvelope, formatMinutes, parseAirtimeRead } from "./airtime";

const READ = {
  ok: true,
  as_of: "2027-01-11",
  programs: [
    {
      program_id: "me",
      name: "Morning Edition",
      avails_per_week: 40,
      minutes_per_week: 30,
      pinned_minutes_per_week: 5,
    },
    {
      program_id: "atc",
      name: "All Things Considered",
      avails_per_week: 10,
      minutes_per_week: "10.5",
      pinned_minutes_per_week: 0,
    },
  ],
};

describe("parseAirtimeRead", () => {
  it("reads the boundary function's payload and rejects an error payload", () => {
    const read = parseAirtimeRead(READ);
    expect(read?.as_of).toBe("2027-01-11");
    expect(read?.programs[1]?.minutes_per_week).toBe(10.5);
    expect(parseAirtimeRead({ error: "forbidden" })).toBeNull();
    expect(parseAirtimeRead(null)).toBeNull();
  });
});

describe("airtimeEnvelope", () => {
  it("nets pins and the contributed envelope off the eligible minutes", () => {
    const envelope = airtimeEnvelope(parseAirtimeRead(READ), 15);
    expect(envelope.availsPerWeek).toBe(50);
    expect(envelope.eligibleMinutesPerWeek).toBe(40.5);
    expect(envelope.pinnedMinutesPerWeek).toBe(5);
    expect(envelope.sellableMinutesPerWeek).toBe(20.5);
    expect(envelope.contributedShare).toBeCloseTo(15 / 40.5, 4);
  });

  it("reads as empty, not broken, with no inventory", () => {
    const envelope = airtimeEnvelope(null, 10);
    expect(envelope.eligibleMinutesPerWeek).toBe(0);
    expect(envelope.sellableMinutesPerWeek).toBe(-10);
    expect(envelope.contributedShare).toBeNull();
  });
});

describe("formatMinutes", () => {
  it("formats minutes and hours", () => {
    expect(formatMinutes(12)).toBe("12 min");
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(120)).toBe("2 h");
    expect(formatMinutes(2.5)).toBe("2.5 min");
  });
});
