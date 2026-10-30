import { describe, expect, it } from "vitest";
import { parseCdsProgramEpisodeResponse } from "./npr-response";

function listResponse(items: unknown[]) {
  return { list: { count: items.length, total: items.length, items } };
}

function episodeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: "morning-edition-20260807",
    profileIds: ["program-episode"],
    title: "Morning Edition for August 07, 2026",
    items: {
      items: [
        { id: "story-1", title: "First story", teaser: "The first teaser." },
        { id: "story-2", title: "Second story", teaser: "The second teaser." },
      ],
    },
    ...overrides,
  };
}

describe("parseCdsProgramEpisodeResponse", () => {
  it("parses a found episode with ordered items and stable ids distinct from titles", () => {
    const result = parseCdsProgramEpisodeResponse(listResponse([episodeDoc()]));
    if (result.status !== "found") throw new Error("expected found");

    expect(result.npr_episode_id).toBe("morning-edition-20260807");
    expect(result.title).toBe("Morning Edition for August 07, 2026");
    expect(result.items.map((item) => item.npr_item_id)).toEqual(["story-1", "story-2"]);
    expect(result.items.map((item) => item.title)).toEqual(["First story", "Second story"]);
    // The id is never derived from the title.
    expect(result.items[0]!.npr_item_id).not.toBe(result.items[0]!.title);
  });

  it("preserves item order exactly as returned", () => {
    const doc = episodeDoc({
      items: { items: [{ id: "c", title: "C" }, { id: "a", title: "A" }, { id: "b", title: "B" }] },
    });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items.map((item) => item.npr_item_id)).toEqual(["c", "a", "b"]);
  });

  it("accepts a bare items array (no nested transclusion wrapper)", () => {
    const doc = episodeDoc({ items: [{ id: "x", title: "X" }] });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items).toHaveLength(1);
  });

  it("returns not_found when no document matches, rather than throwing", () => {
    const result = parseCdsProgramEpisodeResponse(listResponse([]));
    expect(result).toEqual({ status: "not_found" });
  });

  it("returns not_found when documents exist but none declare the program-episode profile", () => {
    const doc = episodeDoc({ profileIds: ["story"] });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    expect(result).toEqual({ status: "not_found" });
  });

  it("handles a missing/optional teaser gracefully instead of failing", () => {
    const doc = episodeDoc({ items: { items: [{ id: "x", title: "No teaser here" }] } });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items[0]!.teaser).toBeNull();
  });

  it("falls back to a description field when teaser is absent", () => {
    const doc = episodeDoc({
      items: { items: [{ id: "x", title: "T", description: "fallback teaser text" }] },
    });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items[0]!.teaser).toBe("fallback teaser text");
  });

  it("drops an item with no usable id rather than inventing one", () => {
    const doc = episodeDoc({
      items: { items: [{ title: "No id" }, { id: "story-2", title: "Has id" }] },
    });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.npr_item_id).toBe("story-2");
  });

  it("defaults a missing item title to a placeholder rather than dropping real content", () => {
    const doc = episodeDoc({ items: { items: [{ id: "x" }] } });
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items[0]!.title).toBe("(untitled)");
  });

  it("throws clearly on a malformed episode document with no usable id", () => {
    const doc = episodeDoc({ id: undefined });
    expect(() => parseCdsProgramEpisodeResponse(listResponse([doc]))).toThrow(/no usable id/);
  });

  it("throws clearly on a completely unrecognized response shape", () => {
    expect(() => parseCdsProgramEpisodeResponse({ unexpected: "shape" })).toThrow(/doesn't recognize/);
    expect(() => parseCdsProgramEpisodeResponse("not even an object")).toThrow(/doesn't recognize/);
    expect(() => parseCdsProgramEpisodeResponse(null)).toThrow(/doesn't recognize/);
  });

  it("names the top-level keys it saw when the shape is unrecognized", () => {
    expect(() => parseCdsProgramEpisodeResponse({ version: "1", data: [] })).toThrow(
      /top-level keys: version, data/,
    );
  });

  it("parses the real CDS envelope ({ resources: [...] })", () => {
    const result = parseCdsProgramEpisodeResponse({ resources: [episodeDoc()] });
    if (result.status !== "found") throw new Error("expected found");
    expect(result.npr_episode_id).toBe("morning-edition-20260807");
    expect(result.items).toHaveLength(2);
  });

  it("recognizes CDS's profile-reference form ({ profiles: [{ href }] })", () => {
    const doc = episodeDoc({
      profileIds: undefined,
      profiles: [
        { href: "/v1/profiles/publishable", rels: ["interface"] },
        { href: "/v1/profiles/program-episode", rels: ["type"] },
      ],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    expect(result.status).toBe("found");
  });

  it("skips a document whose profile references don't include program-episode", () => {
    const doc = episodeDoc({
      profileIds: undefined,
      profiles: [{ href: "/v1/profiles/story", rels: ["type"] }],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    expect(result).toEqual({ status: "not_found" });
  });

  it("extracts a story's audio duration from its primary audio asset", () => {
    const doc = episodeDoc({
      items: [
        {
          href: "/v1/documents/nx-s1-5931262",
          embed: {
            id: "nx-s1-5931262",
            title: "Morning news brief",
            audio: [{ href: "#/assets/nx-s1-9895518", rels: ["primary", "headline"] }],
            assets: {
              "nx-s1-9895518": { id: "nx-s1-9895518", duration: 673 },
              "nx-s1-5931262-1": { id: "nx-s1-5931262-1" },
            },
          },
        },
      ],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items[0]!.duration_seconds).toBe(673);
  });

  it("prefers the primary-rel audio reference over an earlier non-primary one", () => {
    const doc = episodeDoc({
      items: [
        {
          embed: {
            id: "x",
            title: "T",
            audio: [
              { href: "#/assets/promo-cut", rels: ["promo"] },
              { href: "#/assets/full-cut", rels: ["primary"] },
            ],
            assets: {
              "promo-cut": { duration: 30 },
              "full-cut": { duration: 240 },
            },
          },
        },
      ],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items[0]!.duration_seconds).toBe(240);
  });

  it("returns a null duration for a story whose audio asset has none (web-only version)", () => {
    const doc = episodeDoc({
      items: [
        {
          embed: {
            id: "x",
            title: "T",
            audio: [{ href: "#/assets/unavailable", rels: ["primary"] }],
            assets: { unavailable: { isAvailable: false } },
          },
        },
        { embed: { id: "y", title: "No audio at all" } },
      ],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items.map((item) => item.duration_seconds)).toEqual([null, null]);
  });

  it("reads a transcluded item's document from its embed key (the real CDS shape)", () => {
    const doc = episodeDoc({
      items: [
        {
          href: "/v1/documents/nx-s1-5931262",
          embed: {
            id: "nx-s1-5931262",
            title: "Morning news brief",
            teaser: "The day's top stories.",
            profiles: [{ href: "/v1/profiles/story", rels: ["type"] }],
          },
        },
      ],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items).toEqual([
      expect.objectContaining({
        npr_item_id: "nx-s1-5931262",
        title: "Morning news brief",
        teaser: "The day's top stories.",
      }),
    ]);
  });

  it("derives an item id from a reference-shaped entry's href (CDS's own document id)", () => {
    const doc = episodeDoc({
      items: [{ href: "/v1/documents/nx-s1-999?fields=title", rels: ["item"] }],
    });
    const result = parseCdsProgramEpisodeResponse({ resources: [doc] });
    if (result.status !== "found") throw new Error("expected found");
    expect(result.items.map((item) => item.npr_item_id)).toEqual(["nx-s1-999"]);
    expect(result.items[0]!.title).toBe("(untitled)");
  });

  it("preserves the raw episode document for future field access", () => {
    const doc = episodeDoc();
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.raw).toEqual(doc);
  });
});
