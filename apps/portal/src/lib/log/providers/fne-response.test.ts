import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  groupFneStories,
  parseFneFeed,
  parseFneTitle,
  withinLastHours,
} from "./fne-response";

// Cut from the live feed (2026-10-08): entities in text and in the signed
// enclosure URL, a WRAP/CUT pair, a "(Hold until …)" title, and a titled item
// with no enclosure.
const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Florida News Exchange</title>
<item>
  <title>WRAP - Seminole County planning commissioners reject requested rural boundary change</title>
  <description>Seminole County&#8217;s planning commission.

As Central Florida Public Media&#8217;s Molly Duerig [[DURR-igg]] explains.</description>
  <pubDate>Wed, 07 Oct 2026 23:40:31 -0400</pubDate>
  <guid>https://networks.prx.org/florida-news-exchange/items/180986</guid>
  <link>https://networks.prx.org/florida-news-exchange/items/180986</link>
  <enclosure type="audio/wav" url="https://s3.amazonaws.com/x/wrap_web.mp3?X-Amz-Date=20261008T121713Z&amp;X-Amz-Expires=3600" length="4619852"/>
</item>
<item>
  <title>CUT - Seminole County planning commissioners reject requested rural boundary change</title>
  <description>Short version.</description>
  <pubDate>Wed, 07 Oct 2026 23:38:27 -0400</pubDate>
  <guid>https://networks.prx.org/florida-news-exchange/items/180985</guid>
  <link>https://networks.prx.org/florida-news-exchange/items/180985</link>
  <enclosure type="audio/wav" url="https://s3.amazonaws.com/x/cut_web.mp3" length="1228580"/>
</item>
<item>
  <title>(Hold until 10/8) TW: A look back at the magic of early cinema in Tampa </title>
  <description>A new exhibit in Tampa.</description>
  <pubDate>Wed, 07 Oct 2026 11:45:43 -0400</pubDate>
  <guid>https://networks.prx.org/florida-news-exchange/items/180932</guid>
  <link>https://networks.prx.org/florida-news-exchange/items/180932</link>
</item>
</channel></rss>`;

describe("parseFneFeed", () => {
  const items = parseFneFeed(FEED);

  it("reads every item in feed order", () => {
    expect(items.map((item) => item.guid.split("/").pop())).toEqual(["180986", "180985", "180932"]);
  });

  it("decodes entities in the copy and keeps its line breaks and bracketed guides", () => {
    expect(items[0]!.description).toContain("Seminole County’s planning commission.");
    expect(items[0]!.description).toContain("\n\nAs Central Florida");
    expect(items[0]!.description).toContain("[[DURR-igg]]");
  });

  it("converts the publish date to an instant", () => {
    expect(items[0]!.publishedAt).toBe("2026-10-08T03:40:31.000Z");
  });

  it("decodes the signed enclosure URL and reads its size", () => {
    expect(items[0]!.audioUrl).toBe(
      "https://s3.amazonaws.com/x/wrap_web.mp3?X-Amz-Date=20261008T121713Z&X-Amz-Expires=3600",
    );
    expect(items[0]!.audioBytes).toBe(4619852);
  });

  it("allows an item with no audio", () => {
    expect(items[2]!.audioUrl).toBeNull();
    expect(items[2]!.audioBytes).toBeNull();
  });

  it("skips an item with no guid or an unreadable date", () => {
    const broken = `<item><title>x</title><pubDate>nonsense</pubDate><guid>g</guid></item>
      <item><title>y</title><pubDate>Wed, 07 Oct 2026 23:40:31 -0400</pubDate></item>`;
    expect(parseFneFeed(broken)).toEqual([]);
  });

  it("returns nothing for text that is not a feed", () => {
    expect(parseFneFeed("<html>Bad gateway</html>")).toEqual([]);
  });
});

describe("parseFneTitle", () => {
  it.each([
    ["WRAP - Seminole boundary", "Seminole boundary", "wrap", null],
    ["CUT: Florida’s new AI rules", "Florida’s new AI rules", "cut", null],
    ["VOICER - Developer hopes", "Developer hopes", "voicer", null],
    ["(cut) Tallahassee Film Festival", "Tallahassee Film Festival", "cut", null],
    ["(Super) Tallahassee Film Festival", "Tallahassee Film Festival", "super", null],
    [
      "FOR THURS: Pinellas Schools will revisit WRAP",
      "Pinellas Schools will revisit",
      "wrap",
      "For THURS",
    ],
    ["(Hold until 10/8) TW: A look back ", "TW: A look back", "other", "Hold until 10/8"],
    [
      "FPREN-ME-Isaias becomes the first hurricane",
      "FPREN-ME-Isaias becomes the first hurricane",
      "other",
      null,
    ],
    ["Worrell Hope Florida review ", "Worrell Hope Florida review", "other", null],
  ])("%s", (raw, title, kind, holdNote) => {
    expect(parseFneTitle(raw)).toEqual({ title, kind, holdNote });
  });

  it("does not take a tag word out of the middle of a headline", () => {
    expect(parseFneTitle("Voters cut ties with the old rules").kind).toBe("other");
  });
});

describe("groupFneStories", () => {
  it("puts a WRAP and its CUT together, newest version first, and orders stories by recency", () => {
    const stories = groupFneStories(parseFneFeed(FEED));
    expect(stories).toHaveLength(2);
    expect(stories[0]!.versions.map((v) => v.kind)).toEqual(["wrap", "cut"]);
    expect(stories[1]!.title).toContain("TW: A look back");
  });
});

describe("decodeEntities", () => {
  it("decodes numeric, hex and named references, and &amp; last", () => {
    expect(decodeEntities("a&#8217;b &#x2019; &lt;i&gt; &amp;lt;")).toBe("a’b ’ <i> &lt;");
  });
});

describe("withinLastHours", () => {
  it("keeps only items from the last 24 hours", () => {
    const items = parseFneFeed(FEED);
    // The feed's items are 2026-10-08 03:40Z, 03:38Z and 2026-10-07 15:45Z.
    const kept = withinLastHours(items, new Date("2026-10-08T17:00:00.000Z"));
    expect(kept.map((i) => i.guid.split("/").pop())).toEqual(["180986", "180985"]);
  });
});
