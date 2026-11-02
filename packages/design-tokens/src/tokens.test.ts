import { describe, expect, it } from "vitest";
import { baseCss, tailwindThemeCss, colors, contrastRatio, layout, themeCss, typeScale } from "./index";

describe("colors", () => {
  it("are all six-digit hex, so contrast and CSS generation can trust them", () => {
    for (const [name, value] of Object.entries(colors)) {
      expect(value, name).toMatch(/^#[0-9A-F]{6}$/);
    }
  });

  it("keep the brand values the Portal and the design system share", () => {
    expect(colors["wuwf-blue"]).toBe("#3090D0");
    expect(colors["wuwf-blue-700"]).toBe("#185F95");
    expect(colors["surface-dark"]).toBe("#0F2235");
    expect(colors["on-air-red"]).toBe("#D63E2D");
  });
});

describe("contrast", () => {
  it("matches the reference values for black on white and identical colours", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#3090D0", "#3090D0")).toBeCloseTo(1, 5);
  });

  it("is symmetric", () => {
    expect(contrastRatio(colors.ink, colors.surface)).toBeCloseTo(contrastRatio(colors.surface, colors.ink), 10);
  });

  it("body text and the link colour pass AA on the page background", () => {
    expect(contrastRatio(colors.ink, colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors["ink-3"], colors.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors["wuwf-blue-700"], colors.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("white on the primary button blue passes AA; white on brand blue alone does not", () => {
    expect(contrastRatio("#FFFFFF", colors["wuwf-blue-700"])).toBeGreaterThanOrEqual(4.5);
    // The design system warns of this: 3.5:1, so brand blue is for bold 14px+ text only.
    expect(contrastRatio("#FFFFFF", colors["wuwf-blue"])).toBeLessThan(4.5);
    expect(contrastRatio("#FFFFFF", colors["wuwf-blue"])).toBeGreaterThanOrEqual(3);
  });

  it("text on the dark surfaces passes AA", () => {
    expect(contrastRatio("#FFFFFF", colors["surface-dark"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors["surface-dark-text"], colors["surface-dark"])).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(colors["wuwf-lime"], colors["surface-dark"])).toBeGreaterThanOrEqual(4.5);
  });

  it("the design system's own disabled-text colour fails AA, as it says, so it must never carry meaning", () => {
    expect(contrastRatio(colors["ink-4"], colors.surface)).toBeLessThan(4.5);
  });

  it("rejects anything that is not a six-digit hex", () => {
    expect(() => contrastRatio("red", "#FFFFFF")).toThrow();
    expect(() => contrastRatio("#FFF", "#FFFFFF")).toThrow();
  });
});

describe("baseCss", () => {
  const css = baseCss();
  it("declares every colour once, under :root", () => {
    expect(css.startsWith(":root {")).toBe(true);
    expect(css).toContain("--color-wuwf-blue: #3090D0;");
    expect((css.match(/--color-/g) ?? []).length).toBe(Object.keys(colors).length);
  });
  it("carries the layout constants components need", () => {
    expect(css).toContain(`--layout-touch-target: ${layout.touchTarget};`);
    expect(css).toContain("--radius-pill: 999px;");
  });
});

describe("themeCss", () => {
  it("emits only what the theme overrides", () => {
    const css = themeCss('[data-show="barefoot-mary"]', { colors: { "surface-dark": "#000000" } });
    expect(css).toBe('[data-show="barefoot-mary"] {\n  --color-surface-dark: #000000;\n}');
  });
  it("emits nothing for an empty theme", () => {
    expect(themeCss(":root", {})).toBe("");
  });
  it("refuses a value that could break out of the declaration", () => {
    expect(() => themeCss(":root", { colors: { ink: "red; } body { display:none" } })).toThrow();
    expect(() => themeCss(":root", { fonts: { serif: "x}" } })).toThrow();
  });
  it("refuses a token name that is not a safe custom-property name", () => {
    expect(() => themeCss(":root", { colors: { "bad name": "#000000" } })).toThrow();
  });
});

describe("typeScale", () => {
  it("uses the canvas sizes for headlines, lede and article body", () => {
    expect(typeScale["headline-xl"].fontSize).toBe("52px");
    expect(typeScale["headline-lg"].fontSize).toBe("44px");
    expect(typeScale["headline-md"].fontSize).toBe("30px");
    expect(typeScale.lede.fontSize).toBe("21px");
    expect(typeScale["article-body"].fontSize).toBe("20px");
  });
  it("keeps body text at 16px or more, so a phone never zooms on a focused field", () => {
    expect(parseInt(typeScale.body.fontSize, 10)).toBeGreaterThanOrEqual(16);
  });
});

describe("tailwindThemeCss", () => {
  const css = tailwindThemeCss();
  it("is a single @theme block with every colour, so each becomes a utility", () => {
    expect(css.startsWith("@theme {")).toBe(true);
    expect((css.match(/--color-/g) ?? []).length).toBe(Object.keys(colors).length);
    expect(css).toContain("--color-surface-dark: #0F2235;");
  });
  it("carries radii and shadows, and no fonts or layout (the app owns those)", () => {
    expect(css).toContain("--radius-pill: 999px;");
    expect(css).toContain("--shadow-2:");
    expect(css).not.toContain("--font-");
    expect(css).not.toContain("--layout-");
  });
});
