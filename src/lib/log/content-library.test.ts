import { describe, expect, it } from "vitest";
import {
  computeEffectiveDurationSeconds,
  computeTotalDurationSeconds,
  type ComponentDurationLike,
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
