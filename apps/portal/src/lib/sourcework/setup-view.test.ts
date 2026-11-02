import { describe, expect, it } from "vitest";
import { sourcesToExtract, splitContextNotes } from "./setup-view";
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
});

describe("Analyze labels", () => {
  it("counts the sources a batch would analyze", async () => {
    const { analyzeButtonLabel } = await import("./setup-view");
    expect(analyzeButtonLabel(0)).toBe("Analyze");
    expect(analyzeButtonLabel(3)).toBe("Analyze (3)");
  });

  it("summarizes a run in findings and clips, and says plainly when there is nothing new", async () => {
    const { analysisSummary } = await import("./setup-view");
    expect(analysisSummary(0, 0)).toBe("Nothing new to review.");
    expect(analysisSummary(1, 0)).toBe("1 finding added for review.");
    expect(analysisSummary(4, 2)).toBe("4 findings and 2 clips added for review.");
    expect(analysisSummary(0, 1)).toBe("1 clip added for review.");
  });
});
