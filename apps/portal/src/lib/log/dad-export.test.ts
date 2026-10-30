import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  automatedBreaksOn,
  buildDadEvents,
  dadLogFileName,
  DAD_LINE_LENGTH,
  formatDadRow,
  formatDadTime,
  hasBlockingIssues,
  parseDadLog,
  rowsFromEvents,
  serializeDadLog,
  toDadText,
  validateDadEvents,
  type DadExportBreak,
  type DadExportItem,
} from "./dad-export";
import { stationLocalToUTC, type WeeklyAutomatedWindow } from "./automated-hours";

const SAMPLE = readFileSync(join(__dirname, "fixtures", "100126tWUWF.log"), "latin1");

describe("the file format", () => {
  it("round-trips RadioTraffic's own export byte for byte", () => {
    const rows = parseDadLog(SAMPLE);
    expect(rows).toHaveLength(25);
    expect(serializeDadLog(rows)).toBe(SAMPLE);
  });

  it("reads the columns where DAD expects them", () => {
    const row = parseDadLog(SAMPLE)[4]!;
    expect(row).toEqual({
      cut: "00013A",
      time: "06:50:05",
      type: "P",
      description: "copy 1 - Loyalty Credit Union",
      spotNumber: "300000167338",
      guid: "e5c761b2-524a-43a5-aaab-3d17c97277e2",
      sequence: 31,
    });
  });

  it("cuts a long description to 30 characters", () => {
    const line = formatDadRow({
      cut: "00022A",
      time: "08:06:30",
      type: "P",
      description: "Copy 2 - Autumn Beck Blackledge",
      spotNumber: "300000169934",
      guid: "fef2ed50-85d0-46e1-8588-df084f79a742",
      sequence: 48,
    });
    expect(line).toHaveLength(DAD_LINE_LENGTH);
    expect(line.slice(45, 76)).toBe("Copy 2 - Autumn Beck Blackledg ");
  });

  it("names the file for the day", () => {
    expect(dadLogFileName("2026-10-01")).toBe("100126tWUWF.log");
  });
});

const overnight: WeeklyAutomatedWindow = {
  id: "w",
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startTime: "20:00:00",
  endTime: "05:00:00",
  effectiveFrom: "2026-01-01",
  effectiveTo: null,
  active: true,
};

function item(overrides: Partial<DadExportItem> & { id: string }): DadExportItem {
  return {
    position: 0,
    kind: "underwriting_credit",
    durationSeconds: 30,
    description: "copy 1 - Loyalty Credit Union",
    cut: "00013A",
    spotNumber: null,
    copyApproved: true,
    copyInDate: true,
    recorded: true,
    fixHref: "/underwriting/copy/c1/edit",
    ...overrides,
  };
}

function brk(time: string, items: DadExportItem[], date = "2026-10-01"): DadExportBreak {
  return {
    id: `b-${date}-${time}`,
    rundownId: "r1",
    programName: "Jazz After Hours",
    label: "Local break",
    scheduledAt: stationLocalToUTC(date, time),
    availableSeconds: 90,
    items,
  };
}

describe("buildDadEvents", () => {
  it("keeps only automated breaks on the day, in air order", () => {
    const breaks = [
      brk("21:06:00", [item({ id: "late" })]),
      brk("07:06:00", [item({ id: "hosted" })]),
      brk("02:06:00", [item({ id: "early" })]),
      brk("02:06:00", [item({ id: "next-day" })], "2026-10-02"),
    ];
    const automated = automatedBreaksOn("2026-10-01", breaks, [overnight], []);
    expect(buildDadEvents(automated).map((e) => e.itemId)).toEqual(["early", "late"]);
  });

  it("times items one after another within a break", () => {
    const events = buildDadEvents([
      brk("21:06:00", [
        item({ id: "second", position: 2 }),
        item({ id: "first", position: 1, durationSeconds: 30 }),
      ]),
    ]);
    expect(events.map((e) => [e.itemId, e.time])).toEqual([
      ["first", "21:06:00"],
      ["second", "21:06:30"],
    ]);
  });

  it("writes play rows with the item id as the GUID and a running sequence", () => {
    const events = buildDadEvents([
      brk("21:06:00", [
        item({ id: "11111111-1111-1111-1111-111111111111", spotNumber: 400000000001 }),
      ]),
    ]);
    const [row] = rowsFromEvents(events);
    expect(row).toMatchObject({
      cut: "00013A",
      time: "21:06:00",
      type: "P",
      spotNumber: "400000000001",
      guid: "11111111-1111-1111-1111-111111111111",
      sequence: 1,
    });
  });

  it("refuses to write a row with no spot number", () => {
    expect(() => rowsFromEvents(buildDadEvents([brk("21:06:00", [item({ id: "a" })])]))).toThrow();
  });
});

describe("validateDadEvents", () => {
  it("passes a clean break", () => {
    expect(validateDadEvents([brk("21:06:00", [item({ id: "a" })])])).toEqual([]);
  });

  it("blocks an item with no cut, pointing at its copy", () => {
    const issues = validateDadEvents([brk("21:06:00", [item({ id: "a", cut: null })])]);
    expect(issues.map((i) => [i.code, i.href])).toEqual([["no_cut", "/underwriting/copy/c1/edit"]]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("blocks a Portal cut nobody has recorded, pointing at its copy", () => {
    const issues = validateDadEvents([brk("21:06:00", [item({ id: "a", recorded: false })])]);
    expect(issues.map((i) => [i.code, i.href])).toEqual([
      ["not_recorded", "/underwriting/copy/c1"],
    ]);
    expect(hasBlockingIssues(issues)).toBe(true);
  });

  it("blocks what only a host can do", () => {
    const issues = validateDadEvents([
      brk("21:06:00", [
        item({ id: "a", kind: "live_read", cut: null }),
        item({ id: "b", kind: "weather", cut: null }),
      ]),
    ]);
    expect(issues.map((i) => i.code)).toEqual(["host_only", "host_only"]);
  });

  it("blocks unapproved or out-of-date copy, and a break that runs over", () => {
    const issues = validateDadEvents([
      brk("21:06:00", [
        item({ id: "a", copyApproved: false }),
        item({ id: "b", copyInDate: false }),
        item({ id: "c" }),
        item({ id: "d" }),
      ]),
    ]);
    expect(issues.map((i) => i.code)).toEqual(["copy_not_approved", "copy_out_of_date", "overrun"]);
  });
});

describe("toDadText", () => {
  it("keeps the file plain ASCII", () => {
    expect(toDadText("Juan\u2019s Caf\u00e9 \u2013 \u201CLive\u201D")).toBe(`Juan's Cafe - "Live"`);
    expect(toDadText("\u2603 snow")).toBe("? snow");
  });
});

describe("formatDadTime", () => {
  it("reads a row's time on a 12-hour clock", () => {
    expect(formatDadTime("20:06:18")).toBe("8:06:18 PM");
    expect(formatDadTime("00:49:35")).toBe("12:49:35 AM");
  });
});
