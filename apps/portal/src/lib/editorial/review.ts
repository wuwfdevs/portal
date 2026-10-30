// Reviewer-level recommendation and structured concern flags — deliberately
// separate from numeric scores (design §4B). Comments stay lightweight and
// optional; this module only decides when the UI should *encourage* one, it
// never requires it.

import type { EpConcernFlag, EpRecommendation } from "@/lib/database.types";

export const RECOMMENDATIONS: EpRecommendation[] = [
  "advance",
  "advance_with_revisions",
  "hold_for_development",
  "needs_more_reporting",
  "defer",
  "decline",
  "route_to_immediate_news",
];

export const RECOMMENDATION_LABEL: Record<EpRecommendation, string> = {
  advance: "Advance",
  advance_with_revisions: "Advance with revisions",
  hold_for_development: "Hold for development",
  needs_more_reporting: "Needs more reporting before decision",
  defer: "Defer",
  decline: "Decline",
  route_to_immediate_news: "Route to immediate-news workflow",
};

export const CONCERN_FLAGS: EpConcernFlag[] = [
  "focus_scope",
  "reporting_path",
  "duplication",
  "resource_conflict",
  "viewpoint_breadth",
  "framing",
  "verification",
  "ethics_harm",
  "editorial_independence",
];

export const CONCERN_FLAG_LABEL: Record<EpConcernFlag, string> = {
  focus_scope: "Focus / scope",
  reporting_path: "Reporting path or access",
  duplication: "Duplication",
  resource_conflict: "Resource conflict",
  viewpoint_breadth: "Viewpoint / source breadth",
  framing: "Framing",
  verification: "Verification",
  ethics_harm: "Ethics / harm",
  editorial_independence: "Editorial independence or institutional pressure",
};

/** Recommendations that read as "this pitch is strong" for divergence checks. */
const POSITIVE_RECOMMENDATIONS: EpRecommendation[] = ["advance", "advance_with_revisions"];
/** Recommendations that read as "this pitch should not move forward now." */
const NEGATIVE_RECOMMENDATIONS: EpRecommendation[] = ["decline", "defer"];

export interface ExplanationCheck {
  shouldPrompt: boolean;
  reasons: string[];
}

/**
 * Whether a review is a good candidate to ask "want to say why?" — an
 * extreme score, a recommendation that cuts against the numbers, a high
 * institutional modifier, or a standards concern. Never blocks submission;
 * comments remain optional (design §4B / §6).
 */
export function reviewNeedsExplanation(params: {
  coreScore: number | null;
  scale: { min: number; max: number };
  recommendation: EpRecommendation | null;
  modifierScore: number | null;
  modifierScaleMax: number;
  concernFlags: EpConcernFlag[];
}): ExplanationCheck {
  const { coreScore, scale, recommendation, modifierScore, modifierScaleMax, concernFlags } =
    params;
  const reasons: string[] = [];

  if (coreScore !== null) {
    const range = scale.max - scale.min;
    const nearBoundary = Math.max(range * 0.125, 0.5);
    if (coreScore <= scale.min + nearBoundary) reasons.push("This is a near-lowest score.");
    if (coreScore >= scale.max - nearBoundary) reasons.push("This is a near-highest score.");

    if (recommendation) {
      const fraction = range === 0 ? 0 : (coreScore - scale.min) / range;
      if (fraction >= 0.75 && NEGATIVE_RECOMMENDATIONS.includes(recommendation)) {
        reasons.push("The recommendation reads more negatively than the score.");
      }
      if (fraction <= 0.25 && POSITIVE_RECOMMENDATIONS.includes(recommendation)) {
        reasons.push("The recommendation reads more positively than the score.");
      }
    }
  }

  if (modifierScore !== null && modifierScaleMax > 0 && modifierScore >= modifierScaleMax - 1) {
    reasons.push("The institutional modifier is scored near its maximum.");
  }

  if (concernFlags.length > 0) {
    reasons.push("A standards concern is flagged.");
  }

  return { shouldPrompt: reasons.length > 0, reasons };
}
