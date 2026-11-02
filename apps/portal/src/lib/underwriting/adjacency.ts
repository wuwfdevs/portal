// Competitive-adjacency advisory (point 30 of the domain redesign,
// docs/underwriting-design.md): "WUWF will make appropriate changes in
// scheduling to insure that your sponsorship message does not run adjacent
// to a business with similar services or products." Pure, colocated test.
// An advisory on the manual placement form — never a block there — and the
// same identity rule auto-fill enforces within a break
// (lib/underwriting/inventory-selection.ts).
//
// Industry is a typed category (uw_industry_categories, 2026-09-25), so
// two underwriters conflict when they reference the same category id —
// never by comparing spellings.

export interface AdjacencyCandidate {
  underwriterId: string;
  categoryId: string | null;
}

export interface NearbyPlacement {
  underwriterId: string;
  categoryId: string | null;
}

export interface AdjacencyCheckResult {
  warning: boolean;
  /** Underwriter ids sharing the candidate's category among the nearby placements checked. */
  conflictingUnderwriterIds: string[];
}

/**
 * Flags when another underwriter in the same industry already has a nearby
 * placement. Never fires against the candidate's own placements, and never
 * when the underwriter has no category set at all — there's nothing to
 * compare.
 */
export function checkCompetitiveAdjacency(
  candidate: AdjacencyCandidate,
  nearby: NearbyPlacement[],
): AdjacencyCheckResult {
  if (!candidate.categoryId) return { warning: false, conflictingUnderwriterIds: [] };
  const conflictingUnderwriterIds = [
    ...new Set(
      nearby
        .filter(
          (placement) =>
            placement.underwriterId !== candidate.underwriterId &&
            placement.categoryId === candidate.categoryId,
        )
        .map((placement) => placement.underwriterId),
    ),
  ];
  return { warning: conflictingUnderwriterIds.length > 0, conflictingUnderwriterIds };
}
