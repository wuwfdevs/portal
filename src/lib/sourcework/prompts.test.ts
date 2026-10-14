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
  it("has the three slots that still run a model", () => {
    expect(PROMPT_SLOTS.map((d) => d.slot)).toEqual(["analyze", "synthesis", "outline"]);
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
