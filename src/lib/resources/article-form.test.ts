import { describe, expect, it } from "vitest";
import { slugify, validateArticleForm, type ArticleFormInput } from "./article-form";
import { anyWordQuery, embeddingInputForArticle, shapeResourceSearchResults } from "./articles";
import {
  pngSize,
  screenshotObjectPath,
  shotObjectPath,
  validateScreenshot,
  SCREENSHOT_MAX_BYTES,
} from "./screenshot-rules";
import { screensForTool } from "./screens";

const TOOLS = new Set(["transcription", "log"]);

function input(overrides: Partial<ArticleFormInput> = {}): ArticleFormInput {
  return {
    kind: "procedure",
    title: "Overnight automation handoff",
    slug: "",
    summary: "",
    audience: ["staff"],
    versionNote: "",
    area: "On air",
    ownerRole: "Operations",
    toolKey: "",
    screenKeys: [],
    sortOrder: "",
    ...overrides,
  };
}

describe("slugify", () => {
  it("makes a readable address from a title", () => {
    expect(slugify("Weekly EAS required test")).toBe("weekly-eas-required-test");
    expect(slugify("  Café & Q&A: “Rules”!  ")).toBe("cafe-and-q-and-a-rules");
    expect(slugify("!!!")).toBe("");
  });
});

describe("validateArticleForm", () => {
  it("derives the slug and trims optional fields to null", () => {
    const result = validateArticleForm(input({ summary: "  " }), TOOLS);
    expect(result).toEqual({
      ok: true,
      fields: {
        title: "Overnight automation handoff",
        slug: "overnight-automation-handoff",
        summary: null,
        audience: ["staff"],
        versionNote: null,
        area: "On air",
        ownerRole: "Operations",
        toolKey: null,
        screenKeys: [],
        sortOrder: 0,
      },
    });
  });

  it("names the field that failed", () => {
    expect(validateArticleForm(input({ title: " " }), TOOLS)).toMatchObject({ field: "title" });
    expect(validateArticleForm(input({ slug: "Not A Slug" }), TOOLS)).toMatchObject({
      field: "slug",
    });
    expect(validateArticleForm(input({ audience: [] }), TOOLS)).toMatchObject({
      field: "audience",
    });
    expect(validateArticleForm(input({ area: "  " }), TOOLS)).toMatchObject({ field: "area" });
  });

  it("accepts any non-empty area — it's free text, not a fixed list", () => {
    const result = validateArticleForm(input({ area: "Membership & Development" }), TOOLS);
    expect(result.ok && result.fields.area).toBe("Membership & Development");
    expect(validateArticleForm(input({ area: "x".repeat(61) }), TOOLS)).toMatchObject({
      field: "area",
    });
  });

  it("keeps audiences in a fixed order and ignores unknown ones", () => {
    const result = validateArticleForm(input({ audience: ["partners", "x", "staff"] }), TOOLS);
    expect(result.ok && result.fields.audience).toEqual(["staff", "partners"]);
  });

  it("requires a known tool for a guide, and screens from that tool only", () => {
    const guide = (overrides: Partial<ArticleFormInput>) =>
      validateArticleForm(input({ kind: "guide", area: "", ...overrides }), TOOLS);
    expect(guide({ toolKey: "roadmap" })).toMatchObject({ field: "tool_key" });
    expect(guide({ toolKey: "log", screenKeys: ["sourcework.project"] })).toMatchObject({
      field: "screen_keys",
    });
    const ok = guide({ toolKey: "log", screenKeys: ["log.clock", "log.clock"], sortOrder: "20" });
    expect(ok.ok && ok.fields).toMatchObject({
      toolKey: "log",
      screenKeys: ["log.clock"],
      sortOrder: 20,
      area: null,
    });
    expect(guide({ toolKey: "log", sortOrder: "1.5" })).toMatchObject({ field: "sort_order" });
  });
});

describe("screensForTool", () => {
  it("finds a tool's screens by tool key, not by the screen key's prefix", () => {
    expect(screensForTool("transcription").map((screen) => screen.key)).toContain(
      "sourcework.project",
    );
    expect(screensForTool("nope")).toEqual([]);
  });
});

describe("screenshot rules", () => {
  it("accepts PNG and WebP within the limits", () => {
    expect(
      validateScreenshot({ type: "image/png", size: 1000 }, { width: 1280, height: 800 }),
    ).toBe(null);
    expect(
      validateScreenshot({ type: "image/jpeg", size: 1000 }, { width: 10, height: 10 }),
    ).toMatch(/PNG or WebP/);
    expect(
      validateScreenshot(
        { type: "image/webp", size: SCREENSHOT_MAX_BYTES + 1 },
        { width: 10, height: 10 },
      ),
    ).toMatch(/2 MB/);
    expect(
      validateScreenshot({ type: "image/png", size: 10 }, { width: 2401, height: 10 }),
    ).toMatch(/2400px/);
  });

  it("builds object paths", () => {
    expect(screenshotObjectPath("a", "m", "image/webp")).toBe("a/m.webp");
    expect(shotObjectPath("sourcework.project", "source-pill-row")).toBe(
      "shots/sourcework.project/source-pill-row.png",
    );
  });
});

describe("pngSize", () => {
  it("reads the IHDR dimensions, and refuses anything that isn't a PNG", () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(bytes.buffer);
    view.setUint32(16, 1280);
    view.setUint32(20, 800);
    expect(pngSize(bytes)).toEqual({ width: 1280, height: 800 });
    expect(pngSize(new Uint8Array(24))).toBeNull();
  });
});

describe("shapeResourceSearchResults", () => {
  const hit = (kind: "procedure" | "guide" | "release_note", slug: string, tool?: string) => ({
    article: { kind, slug, title: slug, summary: null },
    tool: tool ? { key: tool, name: tool.toUpperCase() } : null,
  });
  const hits = [
    hit("guide", "read-a-clock", "log"),
    hit("procedure", "eas-test"),
    hit("release_note", "clock-diagram", "log"),
    hit("guide", "add-a-source", "transcription"),
  ];

  it("keeps rank order, links each result, and names its tool", () => {
    expect(shapeResourceSearchResults(hits, { limit: 10 }).map((result) => result.url)).toEqual([
      "/resources/tools/log/read-a-clock",
      "/resources/procedures/eas-test",
      "/resources/whats-new#clock-diagram",
      "/resources/tools/transcription/add-a-source",
    ]);
    expect(shapeResourceSearchResults(hits, { limit: 1 })[0]).toMatchObject({ tool: "LOG" });
  });

  it("narrows by kind and tool, then caps", () => {
    expect(shapeResourceSearchResults(hits, { kind: "guide", limit: 10 })).toHaveLength(2);
    expect(
      shapeResourceSearchResults(hits, { toolKey: "log", limit: 10 }).map((result) => result.kind),
    ).toEqual(["guide", "release_note"]);
    expect(shapeResourceSearchResults(hits, { limit: 2 })).toHaveLength(2);
  });
});

describe("anyWordQuery", () => {
  it("widens a question to any of its words", () => {
    expect(anyWordQuery("how do I add a source")).toBe("how or do or I or add or a or source");
    expect(anyWordQuery('"exact phrase" -excluded (group)')).toBe(
      "exact or phrase or excluded or group",
    );
    expect(anyWordQuery("clock or diagram")).toBe("clock or diagram");
  });

  it("has nothing to widen for one word", () => {
    expect(anyWordQuery("clock")).toBeNull();
    expect(anyWordQuery("  ")).toBeNull();
  });
});

describe("embeddingInputForArticle", () => {
  it("embeds the title, summary, and body text, skipping what's empty", () => {
    expect(
      embeddingInputForArticle({ title: "Read a clock", summary: null, body_text: " The ring. " }),
    ).toBe("Read a clock\n\nThe ring.");
    expect(
      embeddingInputForArticle({ title: "T", summary: "S", body_text: "x".repeat(9000) }),
    ).toHaveLength(8000);
  });
});
