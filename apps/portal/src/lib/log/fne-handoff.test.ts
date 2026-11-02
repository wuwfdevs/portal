import { describe, expect, it } from "vitest";
import { buildFnePrefill, buildFneLibraryHandoffPath, readPrefill } from "./fne-handoff";

const ITEM = {
  title: "Florida Prepares for Possible Major Hurricane",
  holdNote: null,
  description: "State emergency management officials are preparing.",
  link: "https://networks.prx.org/florida-news-exchange/items/180945",
};

describe("buildFnePrefill", () => {
  it("puts the feed description in the summary and leaves the script alone", () => {
    const prefill = buildFnePrefill(ITEM);
    expect(prefill).not.toHaveProperty("script");
    expect(prefill.summary).toBe(
      "State emergency management officials are preparing.\n\nFrom Florida News Exchange (PRX): https://networks.prx.org/florida-news-exchange/items/180945",
    );
    expect(prefill.content_type).toBe("news");
  });

  it("carries a hold note onto the summary", () => {
    expect(buildFnePrefill({ ...ITEM, holdNote: "Hold until 10/8" }).summary).toMatch(
      /^Hold note from the feed: Hold until 10\/8\./,
    );
  });

  it("caps a long description so the link stays short", () => {
    const summary = buildFnePrefill({ ...ITEM, description: "x".repeat(5000) }).summary;
    expect(summary.length).toBeLessThan(1500);
    expect(summary).toContain("…");
  });

  it("still names the source when the feed gave no description", () => {
    expect(buildFnePrefill({ ...ITEM, description: "" }).summary).toBe(
      "From Florida News Exchange (PRX): https://networks.prx.org/florida-news-exchange/items/180945",
    );
  });
});

describe("hand-off round trip", () => {
  it("reads back what the link carries", () => {
    const path = buildFneLibraryHandoffPath({
      ...ITEM,
      description: "Line one.\n\nLine two & more",
    });
    const url = new URL(path, "https://portal.example");
    expect(url.pathname).toBe("/log/library/new");
    const back = readPrefill(Object.fromEntries(url.searchParams));
    expect(back.title).toBe(ITEM.title);
    expect(back.content_type).toBe("news");
    expect(back.summary).toContain("Line one.\n\nLine two & more");
  });

  it("ignores an unknown content type and unknown keys", () => {
    expect(readPrefill({ content_type: "psa", title: "T" })).toEqual({ title: "T" });
  });
});
