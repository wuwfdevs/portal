import { describe, expect, it } from "vitest";
import {
  aggregateReviews,
  rankSlate,
  validateReviewScores,
  weightedReviewScore,
  type PitchAggregate,
} from "./scoring";

const score = (criterionId: string, value: number, weight = 1) => ({
  criterionId,
  score: value,
  weight,
});

describe("weightedReviewScore", () => {
  it("averages equally-weighted scores", () => {
    expect(weightedReviewScore([score("a", 4), score("b", 2)])).toBe(3);
  });

  it("respects snapshot weights", () => {
    // (5×2 + 1×1) / 3 = 11/3
    expect(weightedReviewScore([score("a", 5, 2), score("b", 1, 1)])).toBeCloseTo(11 / 3);
  });

  it("returns null for an empty review", () => {
    expect(weightedReviewScore([])).toBeNull();
  });
});

describe("aggregateReviews", () => {
  it("averages across reviewers and reports spread", () => {
    const aggregate = aggregateReviews([
      { reviewerId: "r1", scores: [score("a", 5), score("b", 3)] }, // 4
      { reviewerId: "r2", scores: [score("a", 3), score("b", 1)] }, // 2
    ]);
    expect(aggregate.average).toBe(3);
    expect(aggregate.spread).toBe(2);
    expect(aggregate.reviewerCount).toBe(2);
    expect(aggregate.criterionMeans.get("a")).toBe(4);
    expect(aggregate.criterionMeans.get("b")).toBe(2);
  });

  it("handles reviewers who scored under different rubric snapshots", () => {
    // r2 scored after a criterion was added; per-review weighted averages
    // still make sense because each review carries its own weights.
    const aggregate = aggregateReviews([
      { reviewerId: "r1", scores: [score("a", 4)] }, // 4
      { reviewerId: "r2", scores: [score("a", 2), score("b", 4)] }, // 3
    ]);
    expect(aggregate.average).toBe(3.5);
    expect(aggregate.criterionMeans.get("b")).toBe(4);
  });

  it("returns nulls with no reviews", () => {
    const aggregate = aggregateReviews([]);
    expect(aggregate.average).toBeNull();
    expect(aggregate.spread).toBeNull();
    expect(aggregate.reviewerCount).toBe(0);
  });
});

describe("rankSlate", () => {
  const item = (id: string, average: number | null): { id: string; aggregate: PitchAggregate } => ({
    id,
    aggregate: { average, spread: null, reviewerCount: 0, criterionMeans: new Map() },
  });

  it("sorts by average descending with unscored items last", () => {
    const ranked = rankSlate([item("low", 2.1), item("none", null), item("high", 4.5)]);
    expect(ranked.map((r) => r.id)).toEqual(["high", "low", "none"]);
  });

  it("keeps ties in input order", () => {
    const ranked = rankSlate([item("first", 3), item("second", 3)]);
    expect(ranked.map((r) => r.id)).toEqual(["first", "second"]);
  });
});

describe("validateReviewScores", () => {
  const scale = { min: 1, max: 5 };

  it("accepts a complete, in-range review", () => {
    const result = validateReviewScores(["a", "b"], { a: "5", b: "1" }, scale);
    expect(result.error).toBeNull();
    expect(result.scores).toEqual([
      { criterionId: "a", score: 5 },
      { criterionId: "b", score: 1 },
    ]);
  });

  it("rejects missing, out-of-range, and non-integer scores", () => {
    expect(validateReviewScores(["a", "b"], { a: "5" }, scale).error).not.toBeNull();
    expect(validateReviewScores(["a"], { a: "6" }, scale).error).not.toBeNull();
    expect(validateReviewScores(["a"], { a: "0" }, scale).error).not.toBeNull();
    expect(validateReviewScores(["a"], { a: "3.5" }, scale).error).not.toBeNull();
  });
});
