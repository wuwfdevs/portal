import { describe, expect, it } from "vitest";
import { clockToSeconds, parseProgramLog } from "./program-log-import";
import { PROGRAM_LOG_FIXTURE_XML } from "./program-log-import.fixture";

describe("clockToSeconds", () => {
  it("reads mm:ss lengths and hh:mm:ss times", () => {
    expect(clockToSeconds("01:30")).toBe(90);
    expect(clockToSeconds("00:30")).toBe(30);
    expect(clockToSeconds("06:06:00")).toBe(21960);
    expect(clockToSeconds("30:00")).toBe(1800);
  });
});

describe("parseProgramLog against the real export's first two pages", () => {
  const parsed = parseProgramLog(PROGRAM_LOG_FIXTURE_XML);

  it("reads the air date and weekday from the title row", () => {
    expect(parsed.airDate).toBe("2026-08-21");
    expect(parsed.weekday).toBe("Friday");
    expect(parsed.warnings).toEqual([]);
  });

  it("classifies avail markers with their window duration", () => {
    const avails = parsed.events.filter((event) => event.kind === "avail");
    expect(avails.length).toBeGreaterThan(20);
    const first = avails[0]!;
    expect(first.time).toBe("00:06:00");
    expect(first.availDurationSeconds).toBe(30);
    const morningEditionStory = avails.find((event) => event.time === "06:49:35");
    expect(morningEditionStory?.availDurationSeconds).toBe(115);
  });

  it("captures every scheduled credit with cart, copy name, and script", () => {
    const credits = parsed.events.filter((event) => event.kind === "credit");
    expect(credits.map((credit) => [credit.cart, credit.description])).toEqual([
      ["1", "Baptist Healthcare / Copy 1"],
      ["15", "Clark,Partington,Hart,Larry,Bond & Stackhouse / CPH Law"],
      ["10", "FPM - Window World / copy 1"],
      ["29", "Chesser Barr Law Firm / Copy 3"],
      ["103", "Natural Awakenings / expo 2"],
      ["47", "FPM - FL Power & Light / copy 1"],
      ["69", "Clever Ogre / copy 1"],
      ["201", "Live Nation / Johnson"],
      ["181", "Feeding the Gulf Coast / Copy 2"],
    ]);
    for (const credit of credits) {
      expect(credit.script).toBeTruthy();
      expect(credit.lengthSeconds).toBe(30);
    }
  });

  it("attaches a script that lands in the next page-table to its credit", () => {
    // Chesser Barr's credit row is the last content row of page 1; its
    // script row is printed at the top of page 2's table.
    const chesser = parsed.events.find((event) => event.cart === "29");
    expect(chesser?.kind).toBe("credit");
    expect(chesser?.script).toContain("Chesser & Barr");
    expect(chesser?.script).toContain("Valerie Angel");
  });

  it("keeps operational reminders as notes, not content rows", () => {
    const notes = parsed.events.filter((event) => event.kind === "note");
    expect(notes.some((note) => note.description === "Take Meter Readings")).toBe(true);
  });

  it("leaves program starts and script-less content as plain rows", () => {
    const rows = parsed.events.filter((event) => event.kind === "row");
    const descriptions = rows.map((row) => row.description);
    expect(descriptions).toContain("Morning Edition");
    expect(descriptions).toContain("BBC World Service");
    expect(descriptions).toContain("Unearthing Florida");
    // BirdNote carries a cart number but no printed script — a content row,
    // never mistaken for an underwriting credit.
    const birdnote = rows.find((row) => row.cart === "33");
    expect(birdnote?.description).toContain("Birdnote Daily");
    expect(birdnote?.lengthSeconds).toBe(105);
  });

  it("joins wrapped script runs with spaces and decodes entities", () => {
    const clark = parsed.events.find((event) => event.cart === "15");
    expect(clark?.description).toContain("Bond & Stackhouse");
    expect(clark?.script).toContain("Attorneys at Law");
    expect(clark?.script).not.toMatch(/\s{2,}/);
  });

  it("orders events chronologically with same-instant document order kept", () => {
    const seconds = parsed.events.map((event) => event.timeSeconds);
    expect([...seconds].sort((a, b) => a - b)).toEqual(seconds);
    const atSixOhSix = parsed.events.filter((event) => event.time === "06:06:00");
    expect(atSixOhSix.map((event) => event.kind)).toEqual(["avail", "credit"]);
  });
});

describe("parseProgramLog edge cases", () => {
  it("reports an empty document instead of throwing", () => {
    const parsed = parseProgramLog("<w:document></w:document>");
    expect(parsed.events).toEqual([]);
    expect(parsed.airDate).toBeNull();
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("warns when the printed weekday contradicts the date", () => {
    const xml =
      "<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Monday 8/21/2026 WUWF-FM Program Log</w:t></w:r></w:p></w:tc></w:tr>" +
      "<w:tr><w:tc><w:p><w:r><w:t>05:00:00</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Morning Edition</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>";
    const parsed = parseProgramLog(xml);
    expect(parsed.airDate).toBe("2026-08-21");
    expect(parsed.warnings.some((warning) => warning.includes("Friday"))).toBe(true);
  });

  it("keeps an avail whose cell also carries a live-read script as an avail", () => {
    // The 2026-08-24 export's Alphastar credit: a cart-less live read whose
    // script prints inside the avail marker's own description cell. Reading
    // it as an ordinary content row put the whole script into a break label.
    const xml =
      "<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>08:49:35</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>UW Credit (01:55) Support for WUWF comes from Alphastar Wealth Management</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>";
    const parsed = parseProgramLog(xml);
    const event = parsed.events[0]!;
    expect(event.kind).toBe("avail");
    expect(event.availDurationSeconds).toBe(115);
    expect(event.script).toBe("Support for WUWF comes from Alphastar Wealth Management");
  });

  it("attaches a time-less script row to a bare avail with no credit row after it", () => {
    const xml =
      "<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>08:49:35</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>UW Credit (01:55)</w:t></w:r></w:p></w:tc></w:tr>" +
      "<w:tr><w:tc><w:p><w:r><w:t>Support for WUWF comes from Alphastar Wealth Management</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>";
    const parsed = parseProgramLog(xml);
    const event = parsed.events[0]!;
    expect(event.kind).toBe("avail");
    expect(event.script).toBe("Support for WUWF comes from Alphastar Wealth Management");
    expect(parsed.warnings.some((warning) => warning.includes("no owning row"))).toBe(false);
  });

  it("warns about orphan text rather than inventing an owner", () => {
    const xml =
      "<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Support for WUWF comes from nowhere</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>";
    const parsed = parseProgramLog(xml);
    expect(parsed.warnings.some((warning) => warning.includes("no owning row"))).toBe(true);
  });

  it("flags, but doesn't try to split, a script that bundles multiple credits with no separating marker", () => {
    // A real case from a 2026-08-27 export: two live reads printed back to
    // back under one avail, with no second "UW Credit" marker or cart row
    // between them for this parser to split on.
    const xml =
      "<w:document><w:tbl><w:tr><w:tc><w:p><w:r><w:t>08:49:35</w:t></w:r></w:p></w:tc>" +
      "<w:tc><w:p><w:r><w:t>UW Credit (01:00) Support for WUWF comes from Juan’s Flying Burrito on Alcaniz " +
      "Street in Pensacola. Support for WUWF comes from Autumn Beck Blackledge, Attorneys of Divorce and Family " +
      "Law.</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:document>";
    const parsed = parseProgramLog(xml);
    const event = parsed.events[0]!;
    expect(event.kind).toBe("avail");
    expect(event.script).toContain("Juan’s Flying Burrito");
    expect(event.script).toContain("Autumn Beck Blackledge");
    expect(
      parsed.warnings.some((warning) => warning.includes("08:49:35") && warning.includes("2 underwriting credits")),
    ).toBe(true);
  });
});
