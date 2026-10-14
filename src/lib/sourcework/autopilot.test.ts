import { describe, expect, it } from "vitest";
import { planAutopilot, stepIndex, stepsFor, type AutopilotSource } from "./autopilot";

const source = (over: Partial<AutopilotSource> & { id: string }): AutopilotSource => ({
  title: over.id,
  processing: false,
  failed: false,
  analyzed: false,
  analyzing: false,
  ...over,
});

describe("stepsFor", () => {
  it("runs to the draft for a story", () => {
    expect(stepsFor("story").map((s) => s.key)).toEqual([
      "wait",
      "analyze",
      "accept",
      "synthesize",
      "outline",
      "write",
    ]);
  });
  it("stops after Analyze when the reporter reviews first", () => {
    expect(stepsFor("review_first").map((s) => s.key)).toEqual(["wait", "analyze"]);
  });
});

describe("planAutopilot", () => {
  it("analyzes the ready, unanalyzed sources and leaves the rest alone", () => {
    const plan = planAutopilot([
      source({ id: "a" }),
      source({ id: "b", analyzed: true }),
      source({ id: "c", processing: true }),
      source({ id: "d", failed: true }),
      source({ id: "e", analyzing: true }),
    ]);
    expect(plan.toAnalyze.map((s) => s.id)).toEqual(["a"]);
    expect(plan.alreadyAnalyzed).toBe(1);
    expect(plan.waiting.map((s) => s.id)).toEqual(["c"]);
    expect(plan.unusable.map((s) => s.id)).toEqual(["d"]);
    expect(plan.canRun).toBe(true);
  });
  it("cannot run when every source failed", () => {
    expect(planAutopilot([source({ id: "a", failed: true })]).canRun).toBe(false);
    expect(planAutopilot([]).canRun).toBe(false);
  });
});

describe("stepIndex", () => {
  const steps = stepsFor("story");
  it("points at the running or failed step, and past the end when done", () => {
    expect(stepIndex({ phase: "idle" }, steps)).toBe(0);
    expect(stepIndex({ phase: "running", step: "synthesize", detail: null }, steps)).toBe(3);
    expect(stepIndex({ phase: "failed", step: "outline", error: "x" }, steps)).toBe(4);
    expect(stepIndex({ phase: "done" }, steps)).toBe(6);
  });
});
