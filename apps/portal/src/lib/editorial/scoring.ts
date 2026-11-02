// Pure aggregation math for reviewer scores. Every score carries the weight
// (and, for criteria with a non-default scale, the scale) snapshotted when it
// was given (see ep_review_scores), so these functions reproduce a meeting's
// ranking exactly as it stood, regardless of later rubric changes.
//
// Core criteria feed the weighted editorial-merit average, unchanged from the
// original design. The institutional-alignment modifier (and any future
// modifier) is deliberately kept out of that average — see computeAdjustedScore
// and docs/editorial-planning-design.md §4A for the full rationale.

import type { EpCriterionType } from "@/lib/database.types";

export interface CriterionScore {
  criterionId: string;
  score: number;
  weight: number;
  criterionType: EpCriterionType;
}

export interface ReviewScores {
  reviewerId: string;
  scores: CriterionScore[];
}

export interface PitchAggregate {
  /** Mean of each reviewer's weighted core score, or null with no core reviews. */
  average: number | null;
  /** Max minus min of reviewers' weighted core scores — a simple agreement signal. */
  spread: number | null;
  reviewerCount: number;
  /** Unweighted mean score per criterion (core or modifier) across reviewers who scored it. */
  criterionMeans: Map<string, number>;
  /** Mean of reviewers' modifier score, among those who scored it; null if nobody did. */
  modifierAverage: number | null;
  /** How many reviewers scored the modifier — it is optional, so this can be less than reviewerCount. */
  modifierReviewerCount: number;
}

/** One reviewer's weighted core score: Σ(score × weight) / Σ(weight), core criteria only. */
export function weightedReviewScore(scores: CriterionScore[]): number | null {
  const core = scores.filter((s) => s.criterionType === "core");
  const totalWeight = core.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return null;
  const weightedSum = core.reduce((sum, s) => sum + s.score * s.weight, 0);
  return weightedSum / totalWeight;
}

/** One reviewer's modifier score (unweighted; there is normally exactly one modifier criterion). */
export function reviewerModifierScore(scores: CriterionScore[]): number | null {
  const modifiers = scores.filter((s) => s.criterionType === "modifier");
  if (modifiers.length === 0) return null;
  return modifiers.reduce((sum, s) => sum + s.score, 0) / modifiers.length;
}

export function aggregateReviews(reviews: ReviewScores[]): PitchAggregate {
  const coreReviewScores = reviews
    .map((review) => weightedReviewScore(review.scores))
    .filter((value): value is number => value !== null);

  const criterionTotals = new Map<string, { sum: number; count: number }>();
  for (const review of reviews) {
    for (const { criterionId, score } of review.scores) {
      const entry = criterionTotals.get(criterionId) ?? { sum: 0, count: 0 };
      entry.sum += score;
      entry.count += 1;
      criterionTotals.set(criterionId, entry);
    }
  }
  const criterionMeans = new Map<string, number>();
  for (const [criterionId, { sum, count }] of criterionTotals) {
    criterionMeans.set(criterionId, sum / count);
  }

  const modifierScores = reviews
    .map((review) => reviewerModifierScore(review.scores))
    .filter((value): value is number => value !== null);
  const modifierAverage =
    modifierScores.length === 0
      ? null
      : modifierScores.reduce((sum, value) => sum + value, 0) / modifierScores.length;

  if (coreReviewScores.length === 0) {
    return {
      average: null,
      spread: null,
      reviewerCount: reviews.length,
      criterionMeans,
      modifierAverage,
      modifierReviewerCount: modifierScores.length,
    };
  }

  const average = coreReviewScores.reduce((sum, value) => sum + value, 0) / coreReviewScores.length;
  const spread = Math.max(...coreReviewScores) - Math.min(...coreReviewScores);
  return {
    average,
    spread,
    reviewerCount: reviews.length,
    criterionMeans,
    modifierAverage,
    modifierReviewerCount: modifierScores.length,
  };
}

export interface AdjustedScoreResult {
  /** Core score plus the modifier, only once the core score clears the threshold; null with no core score. */
  adjustedScore: number | null;
  /** Whether the modifier actually contributed to adjustedScore this time. */
  modifierApplied: boolean;
}

/**
 * The adjusted priority score: core score, plus the institutional modifier
 * only once the pitch has already cleared a configurable core-merit
 * threshold. Below the threshold the modifier contributes nothing, so it
 * cannot rescue a promotional or editorially weak pitch — see design §4A.
 * Deliberately simple and transparent: no normalization, no reweighting.
 */
export function computeAdjustedScore(params: {
  coreAverage: number | null;
  modifierAverage: number | null;
  minCoreScoreForModifier: number;
}): AdjustedScoreResult {
  const { coreAverage, modifierAverage, minCoreScoreForModifier } = params;
  if (coreAverage === null) return { adjustedScore: null, modifierApplied: false };
  const modifierApplied = modifierAverage !== null && coreAverage >= minCoreScoreForModifier;
  return {
    adjustedScore: coreAverage + (modifierApplied ? modifierAverage : 0),
    modifierApplied,
  };
}

/**
 * Sort slate items into agenda order: highest adjusted score first (falling
 * back to core score for items with no modifier), unscored items last, ties
 * left in input order (stable) so ranking is deterministic.
 */
export function rankSlate<T extends { aggregate: PitchAggregate; adjustedScore: number | null }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    if (a.adjustedScore === null && b.adjustedScore === null) return 0;
    if (a.adjustedScore === null) return 1;
    if (b.adjustedScore === null) return -1;
    return b.adjustedScore - a.adjustedScore;
  });
}

export interface CriterionDef {
  id: string;
  criterionType: EpCriterionType;
  /** Null uses defaultScale — see ep_criteria.scale_min/scale_max. */
  scaleMin: number | null;
  scaleMax: number | null;
}

export interface ScoreValidationResult {
  scores: { criterionId: string; score: number }[];
  error: string | null;
}

/**
 * Validate a submitted review: every core criterion must have an integer
 * score within its scale; a modifier criterion is optional (skipped when
 * blank, per design §4A — reviewers should not be forced to score it when no
 * legitimate institutional connection exists) but must be in range when
 * given. Raw values arrive as strings straight from the form.
 */
export function validateReviewScores(
  criteria: CriterionDef[],
  raw: Record<string, string | undefined>,
  defaultScale: { min: number; max: number },
): ScoreValidationResult {
  const scores: { criterionId: string; score: number }[] = [];
  for (const criterion of criteria) {
    const scale = {
      min: criterion.scaleMin ?? defaultScale.min,
      max: criterion.scaleMax ?? defaultScale.max,
    };
    const rawValue = raw[criterion.id];
    const isBlank = rawValue === undefined || rawValue === "";

    if (isBlank) {
      if (criterion.criterionType === "core") {
        return { scores: [], error: "Score every core criterion before saving your review." };
      }
      continue;
    }

    const score = Number(rawValue);
    if (!Number.isInteger(score) || score < scale.min || score > scale.max) {
      return { scores: [], error: "Score every core criterion before saving your review." };
    }
    scores.push({ criterionId: criterion.id, score });
  }
  return { scores, error: null };
}
