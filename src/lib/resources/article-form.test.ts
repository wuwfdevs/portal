import { describe, expect, it } from "vitest";
import { slugify, validateArticleForm, type ArticleFormInput } from "./article-form";
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
    expect(validateArticleForm(input({ area: "Sports" }), TOOLS)).toMatchObject({ field: "area" });
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
