import { describe, expect, it } from "vitest";
import {
  PROMPT_SLOTS,
  acceptRateLabel,
  promptSlotDefinition,
  validatePromptBody,
  validatePublishNote,
} from "./prompts";

describe("prompt slots", () => {
  it("every slot has built-in text that passes its own validation", () => {
    for (const definition of PROMPT_SLOTS) {
      expect(validatePromptBody(definition.slot, definition.builtIn).ok).toBe(true);
    }
  });
  it("has the four slots that still run a model", () => {
    expect(PROMPT_SLOTS.map((d) => d.slot)).toEqual(["analyze", "synthesis", "outline", "writing"]);
  });
  it("looks a slot up by name", () => {
    expect(promptSlotDefinition("analyze")?.label).toBe("Analyze guide");
    expect(promptSlotDefinition("nope")).toBeNull();
  });
});

describe("validatePromptBody", () => {
  it("trims and normalizes line endings", () => {
    expect(validatePromptBody("analyze", "  a\r\nb  ")).toEqual({ ok: true, body: "a\nb" });
  });
  it("refuses blank text and placeholders", () => {
    expect(validatePromptBody("analyze", "  ").ok).toBe(false);
    const result = validatePromptBody("analyze", "Use {{ questions }} here");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("questions");
  });
  it("refuses text over the limit", () => {
    expect(validatePromptBody("analyze", "x".repeat(20001)).ok).toBe(false);
  });
});

describe("validatePublishNote", () => {
  it("allows blank and refuses over-long", () => {
    expect(validatePublishNote("  ")).toEqual({ ok: true, note: "" });
    expect(validatePublishNote("x".repeat(301)).ok).toBe(false);
  });
});

describe("acceptRateLabel", () => {
  it("is accepted over reviewed, and null before anything is reviewed", () => {
    expect(acceptRateLabel(78, 22)).toBe("78% accepted");
    expect(acceptRateLabel(0, 0)).toBeNull();
    expect(acceptRateLabel(0, 3)).toBe("0% accepted");
  });
});

describe("the writing guide", () => {
  it("asks for attribution in the past tense", () => {
    const writing = PROMPT_SLOTS.find((d) => d.slot === "writing");
    expect(writing?.builtIn).toMatch(/past tense/);
    expect(writing?.builtIn).toContain("said");
  });
});

describe("the synthesis guide", () => {
  it("says what qualifies as an emerging theme, so editors own that judgment", () => {
    const synthesis = PROMPT_SLOTS.find((d) => d.slot === "synthesis");
    expect(synthesis?.builtIn).toMatch(/emerging theme/i);
    expect(synthesis?.builtIn).toMatch(/not a subject they happen to share/);
  });
});
