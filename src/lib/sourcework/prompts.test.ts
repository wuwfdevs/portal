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
  it("only the extraction guide can be tried yet", () => {
    expect(PROMPT_SLOTS.filter((d) => d.tryable).map((d) => d.slot)).toEqual(["extraction"]);
  });
  it("looks a slot up by name", () => {
    expect(promptSlotDefinition("extraction")?.label).toBe("Extraction guide");
    expect(promptSlotDefinition("nope")).toBeNull();
  });
});

describe("validatePromptBody", () => {
  it("trims and normalizes line endings", () => {
    expect(validatePromptBody("extraction", "  a\r\nb  ")).toEqual({ ok: true, body: "a\nb" });
  });
  it("refuses blank text and placeholders", () => {
    expect(validatePromptBody("extraction", "  ").ok).toBe(false);
    const result = validatePromptBody("extraction", "Use {{ questions }} here");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("questions");
  });
  it("refuses text over the limit", () => {
    expect(validatePromptBody("extraction", "x".repeat(20001)).ok).toBe(false);
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
