import { describe, expect, it } from "vitest";
import { reviewNeedsExplanation } from "./review";

const scale = { min: 0, max: 4 };

describe("reviewNeedsExplanation", () => {
  it("does not prompt for an unremarkable middling review", () => {
    const result = reviewNeedsExplanation({
      coreScore: 2.2,
      scale,
      recommendation: "advance_with_revisions",
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("prompts on a near-lowest score", () => {
    const result = reviewNeedsExplanation({
      coreScore: 0,
      scale,
      recommendation: null,
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(true);
    expect(result.reasons.some((r) => r.includes("lowest"))).toBe(true);
  });

  it("prompts on a near-highest score", () => {
    const result = reviewNeedsExplanation({
      coreScore: 4,
      scale,
      recommendation: null,
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(true);
    expect(result.reasons.some((r) => r.includes("highest"))).toBe(true);
  });

  it("prompts when a low score pairs with 'advance'", () => {
    const result = reviewNeedsExplanation({
      coreScore: 1,
      scale,
      recommendation: "advance",
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(true);
    expect(result.reasons.some((r) => r.includes("positively"))).toBe(true);
  });

  it("prompts when a high score pairs with 'decline'", () => {
    const result = reviewNeedsExplanation({
      coreScore: 3.6,
      scale,
      recommendation: "decline",
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(true);
    expect(result.reasons.some((r) => r.includes("negatively"))).toBe(true);
  });

  it("prompts on a near-maximum institutional modifier", () => {
    const result = reviewNeedsExplanation({
      coreScore: 2.2,
      scale,
      recommendation: null,
      modifierScore: 5,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(true);
    expect(result.reasons.some((r) => r.includes("modifier"))).toBe(true);
  });

  it("prompts when any concern flag is raised", () => {
    const result = reviewNeedsExplanation({
      coreScore: 2.2,
      scale,
      recommendation: null,
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: ["framing"],
    });
    expect(result.shouldPrompt).toBe(true);
    expect(result.reasons.some((r) => r.includes("concern"))).toBe(true);
  });

  it("handles a null core score without throwing", () => {
    const result = reviewNeedsExplanation({
      coreScore: null,
      scale,
      recommendation: "advance",
      modifierScore: null,
      modifierScaleMax: 5,
      concernFlags: [],
    });
    expect(result.shouldPrompt).toBe(false);
  });
});
