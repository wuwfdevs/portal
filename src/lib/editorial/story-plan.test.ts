import { describe, expect, it } from "vitest";
import { canTransitionStoryPlanStatus } from "./story-plan";

describe("canTransitionStoryPlanStatus", () => {
  it("lets a reporter submit a draft for editor review", () => {
    expect(canTransitionStoryPlanStatus("draft", "ready_for_editor", "reporter")).toBe(true);
  });

  it("lets a reporter pull a plan back for more work", () => {
    expect(canTransitionStoryPlanStatus("ready_for_editor", "draft", "reporter")).toBe(true);
  });

  it("never lets a reporter approve a plan", () => {
    expect(canTransitionStoryPlanStatus("draft", "approved", "reporter")).toBe(false);
    expect(canTransitionStoryPlanStatus("ready_for_editor", "approved", "reporter")).toBe(false);
  });

  it("never lets a reporter move an approved plan", () => {
    expect(canTransitionStoryPlanStatus("approved", "draft", "reporter")).toBe(false);
  });

  it("lets an editor move freely between distinct states", () => {
    expect(canTransitionStoryPlanStatus("draft", "approved", "editor")).toBe(true);
    expect(canTransitionStoryPlanStatus("approved", "draft", "editor")).toBe(true);
    expect(canTransitionStoryPlanStatus("ready_for_editor", "approved", "editor")).toBe(true);
  });

  it("rejects a no-op transition for anyone", () => {
    expect(canTransitionStoryPlanStatus("draft", "draft", "editor")).toBe(false);
    expect(canTransitionStoryPlanStatus("draft", "draft", "reporter")).toBe(false);
  });
});
