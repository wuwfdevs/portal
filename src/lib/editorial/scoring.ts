// Pure aggregation math for reviewer scores. Every score carries the weight
// snapshotted when it was given (see ep_review_scores), so these functions
// reproduce a meeting's ranking exactly as it stood, regardless of later
// rubric changes.

export interface CriterionScore {
  criterionId: string;
  score: number;
  weight: number;
}

export interface ReviewScores {
  reviewerId: string;
  scores: CriterionScore[];
}

export interface PitchAggregate {
  /** Mean of each reviewer's weighted score, or null with no reviews. */
  average: number | null;
  /** Max minus min of reviewers' weighted scores — a simple agreement signal. */
  spread: number | null;
  reviewerCount: number;
  /** Unweighted mean score per criterion across reviewers. */
  criterionMeans: Map<string, number>;
}

/** One reviewer's weighted score: Σ(score × weight) / Σ(weight). */
export function weightedReviewScore(scores: CriterionScore[]): number | null {
  const totalWeight = scores.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return null;
  const weightedSum = scores.reduce((sum, s) => sum + s.score * s.weight, 0);
  return weightedSum / totalWeight;
}

export function aggregateReviews(reviews: ReviewScores[]): PitchAggregate {
  const reviewScores = reviews
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

  if (reviewScores.length === 0) {
    return { average: null, spread: null, reviewerCount: reviews.length, criterionMeans };
  }

  const average = reviewScores.reduce((sum, value) => sum + value, 0) / reviewScores.length;
  const spread = Math.max(...reviewScores) - Math.min(...reviewScores);
  return { average, spread, reviewerCount: reviews.length, criterionMeans };
}

/**
 * Sort slate items into agenda order: highest average first, unscored items
 * last, ties left in input order (stable) so ranking is deterministic.
 */
export function rankSlate<T extends { aggregate: PitchAggregate }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.aggregate.average === null && b.aggregate.average === null) return 0;
    if (a.aggregate.average === null) return 1;
    if (b.aggregate.average === null) return -1;
    return b.aggregate.average - a.aggregate.average;
  });
}

export interface ScoreValidationResult {
  scores: { criterionId: string; score: number }[];
  error: string | null;
}

/**
 * Validate a submitted review: every listed criterion must have an integer
 * score within the scale. Raw values arrive as strings straight from the form.
 */
export function validateReviewScores(
  criterionIds: string[],
  raw: Record<string, string | undefined>,
  scale: { min: number; max: number },
): ScoreValidationResult {
  const scores: { criterionId: string; score: number }[] = [];
  for (const criterionId of criterionIds) {
    const value = raw[criterionId];
    const score = value === undefined || value === "" ? NaN : Number(value);
    if (!Number.isInteger(score) || score < scale.min || score > scale.max) {
      return { scores: [], error: "Score every criterion before saving your review." };
    }
    scores.push({ criterionId, score });
  }
  return { scores, error: null };
}
