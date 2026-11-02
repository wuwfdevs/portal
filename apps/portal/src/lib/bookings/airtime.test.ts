import { describe, expect, it } from "vitest";
import {
  airtimeEnvelope,
  commitmentMinutesPerWeek,
  envelopeCheck,
  formatMinutes,
  parseAirtimeRead,
  parseHonoredRead,
} from "./airtime";

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

describe("commitments (slice 3)", () => {
  const term = { starts_on: "2027-01-11", ends_on: "2027-05-07" };
  const ourVoices = {
    airings_per_week: 5,
    seconds: 60,
    treatment: "contributed" as const,
    starts_on: "2027-01-11",
    ends_on: null,
  };
  const paid = { ...ourVoices, treatment: "paid" as const, airings_per_week: 10 };
  const lastTerm = { ...ourVoices, starts_on: "2026-08-24", ends_on: "2026-12-11" };

  it("measures a commitment in minutes a week", () => {
    expect(commitmentMinutesPerWeek(ourVoices)).toBe(5);
    expect(commitmentMinutesPerWeek({ ...ourVoices, airings_per_week: 7, seconds: 30 })).toBe(3.5);
  });
  it("checks contributed commitments in the term against the envelope", () => {
    expect(envelopeCheck([ourVoices, paid, lastTerm], term, 12)).toEqual({
      committedMinutesPerWeek: 5,
      contributedMinutesPerWeek: 12,
      remainingMinutesPerWeek: 7,
      exceeded: false,
    });
    expect(
      envelopeCheck([ourVoices, { ...ourVoices, airings_per_week: 10 }], term, 12).exceeded,
    ).toBe(true);
  });
  it("parses the honored read and drops malformed rows", () => {
    expect(parseHonoredRead({ error: "forbidden" })).toBeNull();
    const read = parseHonoredRead({
      ok: true,
      as_of: "2027-02-01",
      commitments: [
        {
          commitment_id: "c1",
          honored_in: "traffic",
          found: true,
          label: "UWF Libraries",
          status: "active",
          placements_in_term: 12,
          seconds_in_term: 360,
        },
        {
          commitment_id: "c2",
          honored_in: "on_air",
          found: true,
          label: "OUR Voices",
          status: "active",
          airings_per_week: 5,
          seconds: 60,
        },
        { commitment_id: "c3", honored_in: "traffic", found: false },
        { commitment_id: "c4", honored_in: "elsewhere", found: true },
        null,
      ],
    });
    expect(read?.commitments).toHaveLength(3);
    expect(read?.commitments[0]).toMatchObject({ honored_in: "traffic", placements_in_term: 12 });
    expect(read?.commitments[1]).toMatchObject({ honored_in: "on_air", airings_per_week: 5 });
    expect(read?.commitments[2]).toEqual({
      commitment_id: "c3",
      honored_in: "traffic",
      found: false,
    });
  });
});
