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

  it("preserves the raw episode document for future field access", () => {
    const doc = episodeDoc();
    const result = parseCdsProgramEpisodeResponse(listResponse([doc]));
    if (result.status !== "found") throw new Error("expected found");
    expect(result.raw).toEqual(doc);
  });
});
