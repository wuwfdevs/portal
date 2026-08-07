// Pure competitive-adjacency advisory (docs/underwriting-design.md §11,
// point 30 of the domain redesign) — grounded in the real Autumn Beck
// Blackledge agreement's own language: "reasonable efforts" to avoid
// scheduling a credit next to another underwriter offering similar
// products/services. This is advisory guidance for a human, never an
// absolute prohibition or a rules DSL — staff judgment decides what to do
// with the warning.

export interface AdjacencyCandidate {
  underwriterId: string;
  category: string | null;
}

export interface NearbyPlacement {
  underwriterId: string;
  category: string | null;
}

export interface AdjacencyCheckResult {
  warning: boolean;
  /** Underwriter ids sharing the candidate's category among the nearby placements checked. */
  conflictingUnderwriterIds: string[];
}

/**
 * Checks a candidate placement against other placements already scheduled
 * nearby (same program/day, or whatever window the caller decides counts as
 * "adjacent" — that judgment lives in the caller, not here). No warning
 * when the underwriter has no category set at all — there's nothing to
 * compare.
 */
export function checkCompetitiveAdjacency(
  candidate: AdjacencyCandidate,
  nearbyPlacements: NearbyPlacement[],
): AdjacencyCheckResult {
  if (!candidate.category) return { warning: false, conflictingUnderwriterIds: [] };

  const conflicting = [
    ...new Set(
      nearbyPlacements
        .filter((placement) => placement.underwriterId !== candidate.underwriterId && placement.category === candidate.category)
        .map((placement) => placement.underwriterId),
    ),
  ];

  return { warning: conflicting.length > 0, conflictingUnderwriterIds: conflicting };
}
