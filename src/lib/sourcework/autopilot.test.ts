import { describe, expect, it } from "vitest";
import {
  acceptsWithoutReview,
  autopilotRunSummary,
  planAutopilot,
  stepIndex,
  stepsFor,
  type AutopilotSource,
} from "./autopilot";

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
    expect(stepsFor("write").map((s) => s.key)).toEqual([
      "wait",
      "analyze",
      "accept",
      "synthesize",
      "outline",
      "write",
    ]);
  });
  it("stops after Analyze when the reporter reviews first", () => {
    expect(stepsFor("analyze").map((s) => s.key)).toEqual(["wait", "analyze"]);
  });
  it("can hand control back after Synthesis or after the outline", () => {
    expect(stepsFor("synthesize").map((s) => s.key)).toEqual([
      "wait",
      "analyze",
      "accept",
      "synthesize",
    ]);
    expect(stepsFor("outline").map((s) => s.key)).toEqual([
      "wait",
      "analyze",
      "accept",
      "synthesize",
      "outline",
    ]);
  });
});

describe("acceptsWithoutReview", () => {
  it("is true for every stop past Analyze", () => {
    expect(acceptsWithoutReview("analyze")).toBe(false);
    expect(acceptsWithoutReview("synthesize")).toBe(true);
    expect(acceptsWithoutReview("write")).toBe(true);
  });
});

describe("autopilotRunSummary", () => {
  it("lists what will run and skips Analyze when nothing needs it", () => {
    expect(autopilotRunSummary("analyze", 1)).toBe("Analyze 1 source");
    expect(autopilotRunSummary("write", 0)).toBe(
      "Accept the suggestions \u00b7 Synthesize \u00b7 Outline \u00b7 Write from outline",
    );
    expect(autopilotRunSummary("synthesize", 3)).toBe(
      "Analyze 3 sources \u00b7 Accept the suggestions \u00b7 Synthesize",
    );
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
  const steps = stepsFor("write");
  it("points at the running or failed step, and past the end when done", () => {
    expect(stepIndex({ phase: "idle" }, steps)).toBe(0);
    expect(stepIndex({ phase: "running", step: "synthesize", detail: null }, steps)).toBe(3);
    expect(stepIndex({ phase: "failed", step: "outline", error: "x" }, steps)).toBe(4);
    expect(stepIndex({ phase: "done" }, steps)).toBe(6);
  });
});
