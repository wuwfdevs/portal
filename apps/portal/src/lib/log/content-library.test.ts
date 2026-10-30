import { describe, expect, it } from "vitest";
import {
  componentScriptText,
  computeEffectiveDurationSeconds,
  computeTotalDurationSeconds,
  type ComponentDurationLike,
  type ComponentScriptLike,
} from "./content-library";

function component(overrides: Partial<ComponentDurationLike> = {}): ComponentDurationLike {
  return { component_type: "recorded_audio", duration_seconds: 30, required: true, ...overrides };
}

describe("computeTotalDurationSeconds", () => {
  it("sums only required components, per the design doc's 30s promo / 8s required outro example", () => {
    const total = computeTotalDurationSeconds(
      [component({ duration_seconds: 30 }), component({ component_type: "live_outro", duration_seconds: 8 })],
      null,
    );
    expect(total).toBe(38);
  });

  it("excludes optional components from the total", () => {
    const total = computeTotalDurationSeconds(
      [component({ duration_seconds: 30 }), component({ component_type: "optional_tag", duration_seconds: 5, required: false })],
      null,
    );
    expect(total).toBe(30);
  });

  it("falls back to the item's own expected duration when it has no components", () => {
    expect(computeTotalDurationSeconds([], 45)).toBe(45);
    expect(computeTotalDurationSeconds([], null)).toBeNull();
  });
});

describe("computeEffectiveDurationSeconds", () => {
  it("matches computeTotalDurationSeconds with no overrides", () => {
    const components = [component({ duration_seconds: 30 }), component({ component_type: "live_outro", duration_seconds: 8 })];
    expect(computeEffectiveDurationSeconds(components, null, {})).toBe(38);
  });

  it("an explicit total override wins outright", () => {
    const components = [component({ duration_seconds: 30 })];
    expect(computeEffectiveDurationSeconds(components, null, { override_duration_seconds: 45 })).toBe(45);
  });

  it("a live-intro override recomposes the total from master components without mutating them", () => {
    const components = [
      component({ component_type: "live_intro", duration_seconds: 5 }),
      component({ component_type: "recorded_audio", duration_seconds: 25 }),
    ];
    const effective = computeEffectiveDurationSeconds(components, null, { override_live_intro_seconds: 12 });
    expect(effective).toBe(37); // 12 + 25, not the master's 5 + 25
    // The master components array itself is never mutated by this call.
    expect(components[0]!.duration_seconds).toBe(5);
  });

  it("a tag override adds a tag that wasn't required in the master, when no components exist at all", () => {
    const effective = computeEffectiveDurationSeconds([], 30, { override_tag_seconds: 10 });
    expect(effective).toBe(10);
  });

  it("falls back to the item's expected duration when overrides are given but sum to zero and there are no components", () => {
    expect(computeEffectiveDurationSeconds([], 30, { override_live_intro_seconds: 0 })).toBe(30);
  });
});

function scriptComponent(overrides: Partial<ComponentScriptLike> = {}): ComponentScriptLike {
  return { component_type: "recorded_audio", script: null, sequence: 1, ...overrides };
}

describe("componentScriptText", () => {
  it("returns null when no component carries a script", () => {
    const components = [scriptComponent({ component_type: "recorded_audio", sequence: 1 })];
    expect(componentScriptText(components)).toBeNull();
  });

  it("returns a single scripted component's text plainly, e.g. a DAD-imported promo's live_outro tag", () => {
    const components = [
      scriptComponent({ component_type: "recorded_audio", sequence: 1 }),
      scriptComponent({ component_type: "live_outro", sequence: 2, script: "Join us for Science Friday, Fridays at 1:00 PM." }),
    ];
    expect(componentScriptText(components)).toBe("Join us for Science Friday, Fridays at 1:00 PM.");
  });

  it("joins multiple scripted components in sequence order, each labeled by component type", () => {
    const components = [
      scriptComponent({ component_type: "live_outro", sequence: 3, script: "Outro tag." }),
      scriptComponent({ component_type: "live_intro", sequence: 1, script: "Intro cue." }),
      scriptComponent({ component_type: "recorded_audio", sequence: 2 }),
    ];
    expect(componentScriptText(components)).toBe("Live intro: Intro cue.\n\nLive outro: Outro tag.");
  });

  it("ignores a blank/whitespace-only script the same as a null one", () => {
    const components = [scriptComponent({ component_type: "live_outro", script: "   " })];
    expect(componentScriptText(components)).toBeNull();
  });
});
