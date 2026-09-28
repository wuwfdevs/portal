import { describe, expect, it } from "vitest";
import {
  formatReleaseDate,
  formatUpdatedDate,
  groupByReleaseDate,
  guideLinksInBody,
} from "./articles";
import { primaryScreenName, screenName } from "./screens";

describe("formatReleaseDate", () => {
  it("formats a calendar date without shifting the day", () => {
    expect(formatReleaseDate("2026-07-31")).toBe("Jul 31, 2026");
    expect(formatReleaseDate("2026-01-01", true)).toBe("Jan 1");
  });
});

describe("formatUpdatedDate", () => {
  it("uses the station's calendar day, not UTC's", () => {
    // 02:00 UTC on Sep 13 is still the evening of Sep 12 in Pensacola.
    expect(formatUpdatedDate("2026-09-13T02:00:00Z")).toBe("Sep 12, 2026");
    expect(formatUpdatedDate("2026-09-13T02:00:00Z", true)).toBe("Sep 12");
  });
});

describe("groupByReleaseDate", () => {
  it("groups by day, newest day first, keeping order within a day", () => {
    const groups = groupByReleaseDate([
      { id: "a", released_on: "2026-08-06" },
      { id: "b", released_on: "2026-09-27" },
      { id: "c", released_on: "2026-08-06" },
      { id: "d", released_on: null },
    ]);
    expect(groups.map((group) => group.date)).toEqual(["2026-09-27", "2026-08-06"]);
    expect(groups[1]?.notes.map((note) => note.id)).toEqual(["a", "c"]);
  });
});

describe("guideLinksInBody", () => {
  const link = (text: string, href: string, bold = false) => ({
    type: "text",
    text,
    marks: [{ type: "link", attrs: { href } }, ...(bold ? [{ type: "bold" }] : [])],
  });

  it("collects guide links once each, joining a label split across nodes", () => {
    const body = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "See " },
            link("Log: ", "/resources/tools/log/log-read-a-clock"),
            link("Read a clock", "/resources/tools/log/log-read-a-clock", true),
            { type: "text", text: " and " },
            link("elsewhere", "https://example.org"),
          ],
        },
        { type: "paragraph", content: [link("again", "/resources/tools/log/log-read-a-clock")] },
      ],
    };
    expect(guideLinksInBody(body)).toEqual([
      { href: "/resources/tools/log/log-read-a-clock", label: "Log: Read a clock" },
    ]);
  });

  it("returns nothing for an unusable body", () => {
    expect(guideLinksInBody(null)).toEqual([]);
  });
});

describe("screen names", () => {
  it("names known screens and skips unknown ones", () => {
    expect(screenName("sourcework.project")).toBe("Project workspace");
    expect(screenName("nope")).toBeNull();
    expect(primaryScreenName(["nope", "log.clock"])).toBe("Clock template");
    expect(primaryScreenName([])).toBeNull();
  });
});
