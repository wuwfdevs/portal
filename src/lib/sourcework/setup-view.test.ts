import { describe, expect, it } from "vitest";
import {
  currentStepIndex,
  extractButtonLabel,
  sourcesToExtract,
  splitContextNotes,
} from "./setup-view";
import type { ContextNote } from "./research";

const note = (id: string, status: "active" | "dismissed"): ContextNote => ({
  id,
  projectId: "p",
  title: id,
  summary: "",
  url: "https://a.org",
  sourceName: "a.org",
  retrievedAt: "2026-10-08T00:00:00Z",
  status,
});

describe("setup view rules", () => {
  it("splits notes by status", () => {
    const { active, dismissed } = splitContextNotes([note("a", "active"), note("b", "dismissed")]);
    expect(active.map((n) => n.id)).toEqual(["a"]);
    expect(dismissed.map((n) => n.id)).toEqual(["b"]);
  });

  it("finds the first step not done", () => {
    const step = (state: "done" | "current" | "upcoming") => ({ label: "", shortLabel: "", state });
    expect(currentStepIndex([step("done"), step("done"), step("current"), step("upcoming")])).toBe(
      2,
    );
    expect(currentStepIndex([step("done"), step("done")])).toBe(2);
  });

  it("runs only idle and failed sources", () => {
    const sources = [
      { state: { kind: "idle" } as const },
      { state: { kind: "failed", error: null } as const },
      { state: { kind: "done", total: 1, toReview: 0 } as const },
      { state: { kind: "running" } as const },
      { state: { kind: "waiting", reason: "processing" } as const },
    ];
    expect(sourcesToExtract(sources)).toHaveLength(2);
  });

  it("labels the batch button", () => {
    expect(extractButtonLabel(0)).toBe("Extract data points");
    expect(extractButtonLabel(3)).toBe("Extract data points (3)");
  });
});
