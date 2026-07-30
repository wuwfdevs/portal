import { describe, expect, it } from "vitest";
import {
  aggregateReviews,
  computeAdjustedScore,
  rankSlate,
  validateReviewScores,
  weightedReviewScore,
  reviewerModifierScore,
  type PitchAggregate,
} from "./scoring";

const score = (
  criterionId: string,
  value: number,
  weight = 1,
  criterionType: "core" | "modifier" = "core",
) => ({ criterionId, score: value, weight, criterionType });

describe("weightedReviewScore", () => {
  it("averages equally-weighted core scores", () => {
    expect(weightedReviewScore([score("a", 4), score("b", 2)])).toBe(3);
  });

  it("respects snapshot weights", () => {
    // (5×2 + 1×1) / 3 = 11/3
    expect(weightedReviewScore([score("a", 5, 2), score("b", 1, 1)])).toBeCloseTo(11 / 3);
  });

  it("ignores modifier scores", () => {
    expect(weightedReviewScore([score("a", 4), score("mod", 5, 1, "modifier")])).toBe(4);
  });

  it("returns null for an empty or all-modifier review", () => {
    expect(weightedReviewScore([])).toBeNull();
    expect(weightedReviewScore([score("mod", 3, 1, "modifier")])).toBeNull();
  });
});

describe("reviewerModifierScore", () => {
  it("returns null when the reviewer left the modifier blank", () => {
    expect(reviewerModifierScore([score("a", 4)])).toBeNull();
  });

  it("returns the modifier's own score, unweighted", () => {
    expect(reviewerModifierScore([score("a", 4), score("mod", 3, 1, "modifier")])).toBe(3);
  });
});

describe("aggregateReviews", () => {
  it("averages core scores across reviewers and reports spread", () => {
    const aggregate = aggregateReviews([
      { reviewerId: "r1", scores: [score("a", 5), score("b", 3)] }, // 4
      { reviewerId: "r2", scores: [score("a", 3), score("b", 1)] }, // 2
    ]);
    expect(aggregate.average).toBe(3);
    expect(aggregate.spread).toBe(2);
    expect(aggregate.reviewerCount).toBe(2);
    expect(aggregate.criterionMeans.get("a")).toBe(4);
    expect(aggregate.criterionMeans.get("b")).toBe(2);
    expect(aggregate.modifierAverage).toBeNull();
    expect(aggregate.modifierReviewerCount).toBe(0);
  });

  it("averages the modifier only across reviewers who scored it", () => {
    const aggregate = aggregateReviews([
      { reviewerId: "r1", scores: [score("a", 4), score("mod", 4, 1, "modifier")] },
      { reviewerId: "r2", scores: [score("a", 2)] }, // left the modifier blank
    ]);
    expect(aggregate.modifierAverage).toBe(4);
    expect(aggregate.modifierReviewerCount).toBe(1);
    expect(aggregate.reviewerCount).toBe(2);
  });

  it("returns nulls with no reviews", () => {
    const aggregate = aggregateReviews([]);
    expect(aggregate.average).toBeNull();
    expect(aggregate.spread).toBeNull();
    expect(aggregate.reviewerCount).toBe(0);
    expect(aggregate.modifierAverage).toBeNull();
  });
});

describe("computeAdjustedScore", () => {
  it("adds the modifier once the core score clears the threshold", () => {
    const result = computeAdjustedScore({
      coreAverage: 3.0,
      modifierAverage: 4,
      minCoreScoreForModifier: 2.5,
    });
    expect(result.adjustedScore).toBe(7);
    expect(result.modifierApplied).toBe(true);
  });

  it("withholds the modifier below the threshold — it cannot rescue a weak pitch", () => {
    const result = computeAdjustedScore({
      coreAverage: 1.5,
      modifierAverage: 5,
      minCoreScoreForModifier: 2.5,
    });
    expect(result.adjustedScore).toBe(1.5);
    expect(result.modifierApplied).toBe(false);
  });

  it("is a no-op when nobody scored the modifier", () => {
    const result = computeAdjustedScore({
      coreAverage: 3.5,
      modifierAverage: null,
      minCoreScoreForModifier: 2.5,
    });
    expect(result.adjustedScore).toBe(3.5);
    expect(result.modifierApplied).toBe(false);
  });

  it("returns null with no core score at all", () => {
    const result = computeAdjustedScore({
      coreAverage: null,
      modifierAverage: 5,
      minCoreScoreForModifier: 2.5,
    });
    expect(result.adjustedScore).toBeNull();
    expect(result.modifierApplied).toBe(false);
  });
});

describe("rankSlate", () => {
  const item = (
    id: string,
    adjustedScore: number | null,
  ): { id: string; aggregate: PitchAggregate; adjustedScore: number | null } => ({
    id,
    adjustedScore,
    aggregate: {
      average: adjustedScore,
      spread: null,
      reviewerCount: 0,
      criterionMeans: new Map(),
      modifierAverage: null,
      modifierReviewerCount: 0,
    },
  });

  it("sorts by adjusted score descending with unscored items last", () => {
    const ranked = rankSlate([item("low", 2.1), item("none", null), item("high", 4.5)]);
    expect(ranked.map((r) => r.id)).toEqual(["high", "low", "none"]);
  });

  it("keeps ties in input order", () => {
    const ranked = rankSlate([item("first", 3), item("second", 3)]);
    expect(ranked.map((r) => r.id)).toEqual(["first", "second"]);
  });
});

describe("validateReviewScores", () => {
  const scale = { min: 0, max: 4 };
  const core = (id: string): import("./scoring").CriterionDef => ({
    id,
    criterionType: "core",
    scaleMin: null,
    scaleMax: null,
  });
  const modifier = (id: string, scaleMin = 0, scaleMax = 5): import("./scoring").CriterionDef => ({
    id,
    criterionType: "modifier",
    scaleMin,
    scaleMax,
  });

  it("accepts a complete, in-range review", () => {
    const result = validateReviewScores([core("a"), core("b")], { a: "4", b: "0" }, scale);
    expect(result.error).toBeNull();
    expect(result.scores).toEqual([
      { criterionId: "a", score: 4 },
      { criterionId: "b", score: 0 },
    ]);
  });

  it("rejects missing, out-of-range, and non-integer core scores", () => {
    expect(validateReviewScores([core("a"), core("b")], { a: "4" }, scale).error).not.toBeNull();
    expect(validateReviewScores([core("a")], { a: "5" }, scale).error).not.toBeNull();
    expect(validateReviewScores([core("a")], { a: "-1" }, scale).error).not.toBeNull();
    expect(validateReviewScores([core("a")], { a: "2.5" }, scale).error).not.toBeNull();
  });

  it("allows a modifier to be left blank", () => {
    const result = validateReviewScores([core("a"), modifier("mod")], { a: "3" }, scale);
    expect(result.error).toBeNull();
    expect(result.scores).toEqual([{ criterionId: "a", score: 3 }]);
  });

  it("validates a scored modifier against its own scale, not the core scale", () => {
    const result = validateReviewScores([core("a"), modifier("mod")], { a: "3", mod: "5" }, scale);
    expect(result.error).toBeNull();
    expect(result.scores).toEqual([
      { criterionId: "a", score: 3 },
      { criterionId: "mod", score: 5 },
    ]);
  });

  it("rejects a modifier score outside its own scale", () => {
    const result = validateReviewScores([core("a"), modifier("mod")], { a: "3", mod: "6" }, scale);
    expect(result.error).not.toBeNull();
  });
});
