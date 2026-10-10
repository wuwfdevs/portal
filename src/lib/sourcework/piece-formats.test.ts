import { describe, expect, it } from "vitest";
import {
  actualityRangeLabel,
  blankSpec,
  describeFormat,
  insertSection,
  lengthAgainstFormat,
  moveSection,
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
  sections: [
    { type: "narration", guidance: "Setup: name the place and the question in one sentence." },
    { type: "actuality", guidance: "Voice: the strongest first-person moment." },
    { type: "narration", guidance: "Close and sign-off. Leave [REPORTER NAME] as a placeholder." },
  ],
  style: "Plain and factual.",
};

describe("readFormatSpec", () => {
  it("reads a stored spec and refuses anything else", () => {
    expect(readFormatSpec(JSON.parse(JSON.stringify(wrap)))).toEqual(wrap);
    expect(readFormatSpec(null)).toBeNull();
    expect(readFormatSpec({ ...wrap, sections: [{ type: "music", guidance: "x" }] })).toBeNull();
    expect(readFormatSpec({ ...wrap, targetSeconds: "60" })).toBeNull();
  });
});

describe("validateFormatSpec", () => {
  it("accepts the blank spec and tidies whitespace", () => {
    const result = validateFormatSpec({
      ...blankSpec(),
      sections: [{ type: "narration", guidance: "  Setup:   one line. " }],
      minActualities: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.spec.sections[0]!.guidance).toBe("Setup: one line.");
  });

  it("refuses a range that runs backwards or a tolerance as long as the piece", () => {
    expect(validateFormatSpec({ ...wrap, minActualities: 4 }).ok).toBe(false);
    expect(validateFormatSpec({ ...wrap, toleranceSeconds: 60 }).ok).toBe(false);
  });

  it("refuses more actuality sections than the range allows", () => {
    const result = validateFormatSpec({ ...wrap, maxActualities: 0, minActualities: 0 });
    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining("1 actuality sections but at most 0"),
    });
  });

  it("needs a narration section, since the model writes only narration", () => {
    const result = validateFormatSpec({
      ...wrap,
      sections: [{ type: "actuality", guidance: "A clip." }],
    });
    expect(result.ok).toBe(false);
  });

  it("refuses an empty section and a {{placeholder}}", () => {
    expect(
      validateFormatSpec({
        ...wrap,
        sections: [...wrap.sections, { type: "narration", guidance: " " }],
      }).ok,
    ).toBe(false);
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

  it("renders the guide the model reads, sections numbered in order", () => {
    const guide = renderFormatGuide("Radio wrap", wrap);
    expect(guide).toContain("Format: Radio wrap.");
    expect(guide).toContain("Length: aim for 1:00; 0:55–1:05 is on target.");
    expect(guide).toContain("a guide, not a quota");
    expect(guide).toContain("2. Actuality: Voice: the strongest first-person moment.");
    expect(guide).toContain("Style:\nPlain and factual.");
  });

  it("measures a draft against the format", () => {
    expect(lengthAgainstFormat(57, wrap)).toBe("0:57 of 1:00");
    expect(lengthAgainstFormat(48, wrap)).toBe("0:48 of 1:00, 12s under");
  });
});

describe("anchor and optional sections", () => {
  const withAnchor: FormatSpec = {
    ...wrap,
    sections: [
      { type: "anchor", optional: true, guidance: "Anchor intro: the newest fact." },
      ...wrap.sections.slice(0, 2),
      { type: "narration", optional: true, guidance: "Tag." },
    ],
  };

  it("keeps the anchor type and the optional flag through a read", () => {
    expect(readFormatSpec(JSON.parse(JSON.stringify(withAnchor)))).toEqual(withAnchor);
  });

  it("tells the model the anchor intro isn't timed and which sections can go", () => {
    const guide = renderFormatGuide("Wrap", withAnchor);
    expect(guide).toContain("The anchor intro is not counted.");
    expect(guide).toContain("1. Anchor intro (optional): Anchor intro: the newest fact.");
    expect(guide).toContain("4. Narration (optional): Tag.");
  });

  it("allows one anchor intro, first only", () => {
    expect(validateFormatSpec(withAnchor).ok).toBe(true);
    const second = {
      ...withAnchor,
      sections: [...withAnchor.sections.slice(1), withAnchor.sections[0]!],
    };
    expect(validateFormatSpec(second).ok).toBe(false);
    const twice = { ...withAnchor, sections: [withAnchor.sections[0]!, ...withAnchor.sections] };
    expect(validateFormatSpec(twice).ok).toBe(false);
  });
});

describe("editing sections", () => {
  it("moves and inserts without mutating", () => {
    const moved = moveSection(wrap.sections, 0, 1);
    expect(moved.map((section) => section.type)).toEqual(["actuality", "narration", "narration"]);
    expect(moveSection(wrap.sections, 0, -1)).toEqual(wrap.sections);
    const inserted = insertSection(wrap.sections, 1, { type: "narration", guidance: "Turn." });
    expect(inserted[1]!.guidance).toBe("Turn.");
    expect(wrap.sections).toHaveLength(3);
  });
});
