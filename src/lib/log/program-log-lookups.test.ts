import { describe, expect, it } from "vitest";
import {
  buildImportTools,
  CONTENT_TOOL,
  COPY_TOOL,
  runImportLookup,
  SCHEDULE_TOOL,
  searchContentItems,
  type ImportLookupData,
} from "./program-log-lookups";

// 2026-09-22 is a Tuesday (UTC day 2).
const DATA: ImportLookupData = {
  scheduleEntries: [
    {
      id: "sched-me",
      program_id: "prog-me",
      program_name: "Morning Edition",
      clock_template_id: "clock-me",
      air_time: "05:00:00",
      duration_minutes: 240,
      entry_type: "recurring",
      days_of_week: [1, 2, 3, 4, 5],
      start_date: "2026-01-01",
      end_date: null,
    },
    {
      id: "sched-wesat",
      program_id: "prog-wesat",
      program_name: "Weekend Edition Saturday",
      clock_template_id: "clock-wesat",
      air_time: "07:00:00",
      duration_minutes: 120,
      entry_type: "recurring",
      days_of_week: [6],
      start_date: "2026-01-01",
      end_date: null,
    },
    {
      id: "sched-bbc",
      program_id: "prog-bbc",
      program_name: "BBC World Service",
      clock_template_id: "clock-bbc",
      air_time: "00:00:00",
      duration_minutes: 300,
      entry_type: "recurring",
      days_of_week: [1, 2, 3, 4, 5],
      start_date: "2026-01-01",
      end_date: null,
    },
  ],
  underwriters: [{ id: "uw-baptist", name: "Baptist Healthcare" }],
  copy: [
    {
      id: "copy-1",
      underwriter_id: "uw-baptist",
      label: "Copy 1",
      cart_identifier: "1",
      script:
        "Local support for WUWF is provided by Baptist Health Care. For 75 years they have served the Gulf Coast with care.",
      duration_seconds: 30,
    },
    {
      id: "copy-other",
      underwriter_id: "uw-other",
      label: "x",
      cart_identifier: null,
      script: null,
      duration_seconds: null,
    },
  ],
  contentItems: [
    { id: "ci-birdnote", title: "BirdNote Daily", content_type: "interview_feature" },
    { id: "ci-uf", title: "Unearthing Florida", content_type: "interview_feature" },
    { id: "ci-1a", title: "1A promo", content_type: "program_promo" },
    { id: "ci-legal", title: "WUWF-FM Station Legal ID", content_type: "legal_id" },
  ],
};

describe("schedule_for_date", () => {
  it("returns only the entries active on that date, by air time, with the id a rundown must reference", () => {
    const result = JSON.parse(
      runImportLookup(SCHEDULE_TOOL, JSON.stringify({ date: "2026-09-22" }), DATA),
    );
    expect(result).toEqual({
      entries: [
        {
          schedule_entry_id: "sched-bbc",
          program_name: "BBC World Service",
          air_time: "00:00",
          duration_minutes: 300,
        },
        {
          schedule_entry_id: "sched-me",
          program_name: "Morning Edition",
          air_time: "05:00",
          duration_minutes: 240,
        },
      ],
    });
  });

  it("says so when nothing airs, and rejects a malformed date", () => {
    expect(
      JSON.parse(runImportLookup(SCHEDULE_TOOL, JSON.stringify({ date: "2025-12-31" }), DATA))
        .entries,
    ).toEqual([]);
    expect(
      JSON.parse(runImportLookup(SCHEDULE_TOOL, JSON.stringify({ date: "Tuesday" }), DATA)).note,
    ).toContain("YYYY-MM-DD");
  });
});

describe("list_copy_for_underwriter", () => {
  it("returns that underwriter's copy with opening words, matching the name loosely", () => {
    const result = JSON.parse(
      runImportLookup(COPY_TOOL, JSON.stringify({ underwriter: "baptist healthcare" }), DATA),
    );
    expect(result.underwriter).toBe("Baptist Healthcare");
    expect(result.copy).toEqual([
      {
        copy_id: "copy-1",
        label: "Copy 1",
        cart: "1",
        duration_seconds: 30,
        script_opening: "Local support for WUWF is provided by Baptist Health Care. For 75…",
      },
    ]);
  });

  it("points an unknown name at NEW rather than guessing", () => {
    const result = JSON.parse(
      runImportLookup(COPY_TOOL, JSON.stringify({ underwriter: "Nobody Inc" }), DATA),
    );
    expect(result.copy).toEqual([]);
    expect(result.note).toContain("NEW");
  });
});

describe("search_content_items", () => {
  it("ranks a containing title first and returns ids the model can copy", () => {
    const result = searchContentItems(
      "Birdnote Daily -Located in the Eco group DAD",
      DATA.contentItems,
    );
    expect(result.matches[0]).toEqual({
      content_item_id: "ci-birdnote",
      title: "BirdNote Daily",
      content_type: "interview_feature",
    });
  });

  it("falls back to word overlap, and says when nothing resembles the query", () => {
    expect(
      searchContentItems("legal station id", DATA.contentItems).matches.map(
        (row) => row.content_item_id,
      ),
    ).toEqual(["ci-legal"]);
    expect(
      searchContentItems("1A", DATA.contentItems).matches.map((row) => row.content_item_id),
    ).toEqual(["ci-1a"]);
    expect(searchContentItems("Take Meter Readings", DATA.contentItems)).toMatchObject({
      matches: [],
    });
    expect(JSON.parse(runImportLookup(CONTENT_TOOL, "{not json", DATA))).toMatchObject({
      matches: [],
    });
  });
});

describe("buildImportTools", () => {
  it("declares the three strict lookup tools", () => {
    const tools = buildImportTools();
    expect(tools.map((tool) => tool.name)).toEqual([SCHEDULE_TOOL, COPY_TOOL, CONTENT_TOOL]);
    expect(tools.every((tool) => tool.strict)).toBe(true);
    expect(JSON.parse(runImportLookup("nope", "{}", DATA))).toEqual({
      error: 'Unknown tool "nope".',
    });
  });
});
