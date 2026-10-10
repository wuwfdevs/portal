import { describe, expect, it } from "vitest";
import {
  actualityRangeLabel,
  blankSpec,
  describeFormat,
  lengthAgainstFormat,
  readFormatSpec,
  renderFormatGuide,
  validateFormatName,
  validateFormatSpec,
  type FormatSpec,
} from "./piece-formats";

const wrap: FormatSpec = {
  targetSeconds: 60,
  toleranceSeconds: 5,
  minActualities: 2,
  maxActualities: 3,
  anchorIntro: false,
  style:
    "A voiced story with tape wrapped inside it. Sign off with [REPORTER NAME]. Plain and factual.",
};

describe("readFormatSpec", () => {
  it("reads a stored spec and refuses anything else", () => {
    expect(readFormatSpec(JSON.parse(JSON.stringify(wrap)))).toEqual(wrap);
    expect(readFormatSpec(null)).toBeNull();
    expect(readFormatSpec({ ...wrap, targetSeconds: "60" })).toBeNull();
    expect(readFormatSpec({ ...wrap, style: undefined })).toBeNull();
  });

  it("reads an older version's ordered sections as a description and an anchor flag", () => {
    const rest = { ...wrap, anchorIntro: undefined };
    const legacy = {
      ...rest,
      sections: [
        { type: "anchor", optional: true, guidance: "Anchor intro: the newest fact." },
        { type: "narration", guidance: "Setup." },
        { type: "actuality", guidance: "A voice." },
      ],
    };
    expect(readFormatSpec(legacy)).toEqual({
      ...wrap,
      style: `Anchor intro: the newest fact. Setup. A voice. ${wrap.style}`,
      anchorIntro: true,
    });
    expect(readFormatSpec({ ...legacy, sections: [{ type: "music", guidance: "x" }] })).toBeNull();
  });

  it("keeps the largest legacy spec (16 sections of 300 characters, a 2,000-character style) valid", () => {
    const rest = { ...wrap, anchorIntro: undefined };
    const sections = Array.from({ length: 16 }, (_, index) => ({
      type: index === 0 ? "anchor" : "narration",
      guidance: "g".repeat(300),
    }));
    const spec = readFormatSpec({ ...rest, sections, style: "s".repeat(2000) });
    expect(spec?.anchorIntro).toBe(true);
    expect(spec?.style).toContain("g".repeat(300));
    expect(validateFormatSpec(spec!).ok).toBe(true);
  });
});

describe("validateFormatSpec", () => {
  it("accepts the blank spec and tidies whitespace", () => {
    const result = validateFormatSpec({
      ...blankSpec(),
      style: "  A short story. \r\n",
      minActualities: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.style).toBe("A short story.");
  });

  it("refuses a range that runs backwards or a tolerance as long as the piece", () => {
    expect(validateFormatSpec({ ...wrap, minActualities: 4 }).ok).toBe(false);
    expect(validateFormatSpec({ ...wrap, toleranceSeconds: 60 }).ok).toBe(false);
  });

  it("refuses a {{placeholder}}", () => {
    expect(validateFormatSpec({ ...wrap, style: "Sign off as {{reporter}}." })).toEqual({
      ok: false,
      error: expect.stringContaining("{{reporter}}"),
    });
  });
});

describe("validateFormatName", () => {
  it("collapses spaces and needs something", () => {
    expect(validateFormatName("  Radio   wrap ")).toEqual({ ok: true, name: "Radio wrap" });
    expect(validateFormatName("   ").ok).toBe(false);
  });
});

describe("describing a format", () => {
  it("says the length and the actuality range", () => {
    expect(describeFormat(wrap)).toBe("0:55–1:05 · 2 to 3 actualities");
    expect(actualityRangeLabel({ minActualities: 1, maxActualities: 1 })).toBe("1 actuality");
    expect(actualityRangeLabel({ minActualities: 0, maxActualities: 0 })).toBe("no actualities");
  });

  it("renders the guide the model reads: guardrails and the free text, no block outline", () => {
    const guide = renderFormatGuide("Radio wrap", wrap);
    expect(guide).toContain("Format: Radio wrap.");
    expect(guide).toContain("Length: aim for 1:00; 0:55–1:05 is on target.");
    expect(guide).toContain("a guide, not a quota");
    expect(guide).toContain(wrap.style);
    expect(guide).toContain("Do not write an anchor_intro block.");
    expect(guide).not.toMatch(/^\d+\. /m);
  });

  it("measures a draft against the format", () => {
    expect(lengthAgainstFormat(57, wrap)).toBe("0:57 of 1:00");
    expect(lengthAgainstFormat(48, wrap)).toBe("0:48 of 1:00, 12s under");
  });
});

describe("anchor intro", () => {
  const withAnchor: FormatSpec = { ...wrap, anchorIntro: true };

  it("is kept through a read and told to the model as uncounted", () => {
    expect(readFormatSpec(JSON.parse(JSON.stringify(withAnchor)))).toEqual(withAnchor);
    const guide = renderFormatGuide("Wrap", withAnchor);
    expect(guide).toContain("The anchor intro is not counted.");
    expect(guide).toContain("this format allows one");
    expect(guide).toContain("write none");
  });
});
