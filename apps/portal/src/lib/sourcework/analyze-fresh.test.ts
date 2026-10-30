import { describe, expect, it } from "vitest";
import { dropDecidedClips, dropDecidedFindings, establishedLabel } from "./analyze-fresh";
import type { AnalyzeFinding } from "./analyze-prompt";

const finding = (questionKey: string | null, ids: number[]): AnalyzeFinding => ({
  questionId: questionKey,
  relevance: questionKey ? "question" : "general",
  questionKey,
  kind: "factual",
  claim: "c",
  significance: "s",
  ranges: [{ from: ids[0]!, to: ids[ids.length - 1]! }],
  unitIds: new Set(ids),
});

describe("dropDecidedFindings", () => {
  const decided = [{ relevance: "question", questionKey: "q1", unitIds: new Set([3, 4, 5, 6]) }];

  it("skips a finding on a passage a person already decided, for the same question", () => {
    const result = dropDecidedFindings([finding("q1", [4, 5])], decided);
    expect(result).toMatchObject({ fresh: [], skipped: 1 });
  });

  it("keeps the same passage for a different question, and a different passage for the same one", () => {
    const result = dropDecidedFindings([finding("q2", [4, 5]), finding("q1", [20, 21])], decided);
    expect(result.fresh).toHaveLength(2);
    expect(result.skipped).toBe(0);
  });

  it("treats a finding with no question as its own bearing", () => {
    expect(dropDecidedFindings([finding(null, [4, 5])], decided).fresh).toHaveLength(1);
    expect(
      dropDecidedFindings(
        [finding(null, [4, 5])],
        [{ relevance: "general", questionKey: null, unitIds: new Set([4, 5]) }],
      ).fresh,
    ).toHaveLength(0);
  });
});

describe("dropDecidedClips", () => {
  const occupied = [{ startMs: 10_000, endMs: 20_000 }];

  it("skips a clip over a stretch already decided or already cut", () => {
    expect(dropDecidedClips([{ startMs: 12_000, endMs: 22_000 }], occupied).skipped).toBe(1);
  });

  it("keeps a clip that only brushes one", () => {
    const result = dropDecidedClips([{ startMs: 19_000, endMs: 30_000 }], occupied);
    expect(result.fresh).toHaveLength(1);
  });
});

describe("establishedLabel", () => {
  it("names the question by the number the model is shown, and nothing for none or an archived one", () => {
    const numbers = new Map([
      ["a", 1],
      ["b", 2],
    ]);
    expect(establishedLabel("b", numbers)).toBe("Q2");
    expect(establishedLabel(null, numbers)).toBeNull();
    expect(establishedLabel("gone", numbers)).toBeNull();
  });
});
