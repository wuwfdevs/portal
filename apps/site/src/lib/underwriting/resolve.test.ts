import { describe, expect, it } from "vitest";
import {
  agreementApplies, agreementTag, collectionTag, resolveUnderwriting, shortForm, validateTerm,
  type Agreement, type CollectionRef, type ContentRef, type ResolveContext,
} from "./resolve";

const EXAMPLE_FOUNDATION_TEXT =
  "Reporting through WUWF's Coastal Futures Fellowship is made possible in part by support from Example Foundation.";

function agreement(over: Partial<Agreement> = {}): Agreement {
  return {
    id: "agr-1", sponsorId: "sp-1", sponsorName: "Example Foundation", text: EXAMPLE_FOUNDATION_TEXT, textVersion: 2,
    kind: "recognition", startsOn: "2026-07-01", endsOn: "2027-06-30", active: true, formats: [], placements: [], ...over,
  };
}

const fellowship = (over: Partial<CollectionRef> = {}): CollectionRef => ({
  id: "col-fellowship", kind: "fellowship", slug: "coastal-futures", title: "Coastal Futures", agreements: [agreement()], ...over,
});
const series: CollectionRef = { id: "col-series", kind: "series", slug: "after-isaias", title: "After Isaias", agreements: [] };
const topic: CollectionRef = { id: "col-topic", kind: "topic", slug: "growth-development", title: "Growth & Development", agreements: [] };

function story(over: Partial<ContentRef> = {}): ContentRef {
  return { id: "story-1", format: "web", publishedAt: "2026-10-28T12:00:00Z", collections: [fellowship(), series, topic], ...over };
}
const ctx = (over: Partial<ResolveContext> = {}): ResolveContext => ({ placement: "article", now: "2026-10-30T12:00:00Z", ...over });

describe("the Coastal Futures / Example Foundation demonstration", () => {
  it("gives a story in a fellowship, a series and a topic exactly one acknowledgment, with the approved sentence", () => {
    const r = resolveUnderwriting(story(), ctx());
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]).toMatchObject({ agreementId: "agr-1", sponsorName: "Example Foundation", text: EXAMPLE_FOUNDATION_TEXT, via: { kind: "fellowship", slug: "coastal-futures" } });
    expect(r.overflow).toEqual([]);
  });

  it("gives the podcast episode and the video the same agreement", () => {
    for (const format of ["audio", "video"] as const) {
      const r = resolveUnderwriting(story({ format }), ctx({ placement: format === "audio" ? "episode" : "video" }));
      expect(r.lines.map((l) => l.agreementId), format).toEqual(["agr-1"]);
    }
  });

  it("changes every affected page when the agreement's wording changes, because the text is read from the record", () => {
    const edited = "Coastal Futures is supported in part by Example Foundation.";
    const make = (id: string) => story({ id, collections: [fellowship({ agreements: [agreement({ text: edited, textVersion: 3 })] }), series, topic] });
    for (const id of ["a", "b", "c"]) {
      const line = resolveUnderwriting(make(id), ctx()).lines[0];
      expect(line?.text).toBe(edited);
      expect(line?.textVersion).toBe(3);
    }
  });

  it("tags every page with the agreement and collections it resolved through, so one change invalidates them all", () => {
    const r = resolveUnderwriting(story(), ctx());
    expect(r.tags).toContain(agreementTag("agr-1"));
    expect(r.tags).toContain(collectionTag("col-fellowship"));
    expect(r.tags).toContain("content:story-1");
    // a topic is not part of the funding path, so editing one never invalidates acknowledgments
    expect(r.tags).not.toContain(collectionTag("col-topic"));
  });
});

describe("what can be underwritten", () => {
  it("never a topic, even if one somehow carries an agreement", () => {
    const sneaky: CollectionRef = { ...topic, agreements: [agreement({ id: "agr-topic" })] };
    const r = resolveUnderwriting(story({ collections: [sneaky] }), ctx());
    expect(r.lines).toEqual([]);
    expect(r.tags.join()).not.toContain("agr-topic");
  });
  it("never a publishing identity", () => {
    const brand: CollectionRef = { id: "voyager", kind: "publishing_identity", slug: "the-voyager", title: "The Voyager", agreements: [agreement({ id: "agr-brand" })] };
    expect(resolveUnderwriting(story({ collections: [brand] }), ctx()).lines).toEqual([]);
  });
  it("a story in no funded collection carries nothing", () => {
    expect(resolveUnderwriting(story({ collections: [series, topic] }), ctx()).lines).toEqual([]);
  });
});

describe("dates", () => {
  const during = (publishedAt: string | null, now = "2030-01-01T00:00:00Z") =>
    resolveUnderwriting(story({ publishedAt }), ctx({ now })).lines.length;

  it("work published during the term carries the line forever, even years after it ends", () => {
    expect(during("2026-10-28T12:00:00Z", "2035-01-01T00:00:00Z")).toBe(1);
  });
  it("includes both ends of the term", () => {
    expect(during("2026-07-01T00:00:00Z")).toBe(1);
    expect(during("2027-06-30T23:59:59Z")).toBe(1);
  });
  it("work published before the term began, or after it ended, does not", () => {
    expect(during("2026-06-30T23:59:59Z")).toBe(0);
    expect(during("2027-07-01T00:00:00Z")).toBe(0);
  });
  it("an open-ended term keeps acknowledging new work", () => {
    const open = story({ collections: [fellowship({ agreements: [agreement({ endsOn: null })] })], publishedAt: "2031-05-05T00:00:00Z" });
    expect(resolveUnderwriting(open, ctx()).lines).toHaveLength(1);
  });
  it("unpublished work carries no recognition yet", () => {
    expect(during(null)).toBe(0);
  });
  it("a campaign shows only while it runs, whenever the work was published", () => {
    const campaign = agreement({ id: "agr-camp", kind: "campaign", startsOn: "2026-10-01", endsOn: "2026-11-30" });
    const c = story({ collections: [fellowship({ agreements: [campaign] })], publishedAt: "2020-01-01T00:00:00Z" });
    expect(resolveUnderwriting(c, ctx({ now: "2026-10-30T00:00:00Z" })).lines).toHaveLength(1);
    expect(resolveUnderwriting(c, ctx({ now: "2026-12-01T00:00:00Z" })).lines).toHaveLength(0);
    expect(resolveUnderwriting(c, ctx({ now: "2026-09-30T00:00:00Z" })).lines).toHaveLength(0);
  });
  it("an inactive agreement never applies", () => {
    expect(agreementApplies(agreement({ active: false }), story(), ctx())).toBe(false);
  });
  it("rejects a timestamp it cannot read instead of guessing", () => {
    expect(() => resolveUnderwriting(story({ publishedAt: "soon" }), ctx())).toThrow(/Not a timestamp/);
  });
});

describe("formats and placements", () => {
  it("honours the formats an agreement names", () => {
    const webOnly = story({ collections: [fellowship({ agreements: [agreement({ formats: ["web"] })] })] });
    expect(resolveUnderwriting(webOnly, ctx()).lines).toHaveLength(1);
    expect(resolveUnderwriting({ ...webOnly, format: "video" }, ctx()).lines).toHaveLength(0);
  });
  it("honours the placements an agreement names", () => {
    const articleOnly = story({ collections: [fellowship({ agreements: [agreement({ placements: ["article", "hub"] })] })] });
    expect(resolveUnderwriting(articleOnly, ctx({ placement: "article" })).lines).toHaveLength(1);
    expect(resolveUnderwriting(articleOnly, ctx({ placement: "card" })).lines).toHaveLength(0);
  });
  it("uses the short form on a promo card, from the sponsor's name when none is written", () => {
    expect(resolveUnderwriting(story(), ctx({ placement: "card" })).lines[0]?.text).toBe("Supported in part by Example Foundation");
    const custom = story({ collections: [fellowship({ agreements: [agreement({ shortText: "Funded by Example Foundation" })] })] });
    expect(resolveUnderwriting(custom, ctx({ placement: "card" })).lines[0]?.text).toBe("Funded by Example Foundation");
    expect(shortForm(agreement({ shortText: "  " }))).toBe("Supported in part by Example Foundation");
  });
});

describe("several agreements", () => {
  const second = agreement({ id: "agr-2", sponsorId: "sp-2", sponsorName: "Gulf Trust", text: "Support from Gulf Trust.", startsOn: "2026-08-01" });
  const third = agreement({ id: "agr-3", sponsorId: "sp-3", sponsorName: "Bay Fund", text: "Support from Bay Fund.", startsOn: "2026-09-01" });
  const seriesWith = (...agreements: Agreement[]): CollectionRef => ({ ...series, agreements });

  it("counts one agreement once, however many collections lead to it", () => {
    const shared = agreement();
    const both = story({ collections: [fellowship({ agreements: [shared] }), seriesWith(shared)] });
    const r = resolveUnderwriting(both, ctx());
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0]?.via.kind).toBe("fellowship"); // the better-ranked route
  });
  it("puts the fellowship before the series, whatever order the content lists them in", () => {
    const content = story({ collections: [seriesWith(second), fellowship()] });
    expect(resolveUnderwriting(content, ctx()).lines.map((l) => l.agreementId)).toEqual(["agr-1", "agr-2"]);
    expect(resolveUnderwriting({ ...content, collections: [...content.collections].reverse() }, ctx()).lines.map((l) => l.agreementId)).toEqual(["agr-1", "agr-2"]);
  });
  it("shows two at most and sends the rest to the hub", () => {
    const content = story({ collections: [fellowship(), seriesWith(second, third)] });
    const r = resolveUnderwriting(content, ctx());
    expect(r.lines.map((l) => l.agreementId)).toEqual(["agr-1", "agr-2"]);
    expect(r.overflow.map((l) => l.agreementId)).toEqual(["agr-3"]);
  });
  it("orders agreements of the same kind by start date, then id, so the result never flickers", () => {
    const a = agreement({ id: "agr-b", startsOn: "2026-07-01" });
    const b = agreement({ id: "agr-a", startsOn: "2026-07-01" });
    const c = agreement({ id: "agr-c", startsOn: "2026-06-15" });
    const r = resolveUnderwriting(story({ collections: [fellowship({ agreements: [a, b, c] })] }), ctx({ maxInline: 5 }));
    expect(r.lines.map((l) => l.agreementId)).toEqual(["agr-c", "agr-a", "agr-b"]);
  });
  it("lets the cap be set, including to zero", () => {
    const content = story({ collections: [fellowship(), seriesWith(second)] });
    expect(resolveUnderwriting(content, ctx({ maxInline: 1 })).lines).toHaveLength(1);
    const none = resolveUnderwriting(content, ctx({ maxInline: 0 }));
    expect(none.lines).toHaveLength(0);
    expect(none.overflow).toHaveLength(2);
    expect(() => resolveUnderwriting(content, ctx({ maxInline: -1 }))).toThrow();
  });
  it("does not mutate its inputs", () => {
    const content = story({ collections: [fellowship(), seriesWith(second)] });
    const before = JSON.stringify(content);
    resolveUnderwriting(content, ctx());
    expect(JSON.stringify(content)).toBe(before);
  });
});

describe("validateTerm", () => {
  it("accepts a real term and an open one", () => {
    expect(validateTerm("2026-07-01", "2027-06-30")).toBeNull();
    expect(validateTerm("2026-07-01", null)).toBeNull();
    expect(validateTerm("2026-07-01", "2026-07-01")).toBeNull();
  });
  it("refuses impossible dates and an end before the start", () => {
    expect(validateTerm("2026-02-30", null)).toMatch(/start date/);
    expect(validateTerm("2026-07-01", "2026-13-01")).toMatch(/end date/);
    expect(validateTerm("2026-07-01", "2026-06-30")).toMatch(/before the start/);
    expect(validateTerm("07/01/2026", null)).toMatch(/start date/);
  });
});
