// Pure cycle-detection for Phase 5's theme parent-picker
// (docs/sourcework-analysis-design.md §5) — no "server-only", mirroring
// status.ts's split from projects.ts (same reason: needs to be importable
// from a plain unit test without pulling in Supabase access).

/**
 * Would setting `proposedParentId` as `themeId`'s parent create a cycle?
 * True if the proposed parent is the theme itself, or if walking up the
 * proposed parent's own ancestor chain ever reaches back to themeId.
 */
export function wouldCreateThemeCycle(
  themeId: string,
  proposedParentId: string,
  parentByThemeId: Map<string, string | null>,
): boolean {
  if (themeId === proposedParentId) return true;

  let current: string | null = proposedParentId;
  const visited = new Set<string>();
  while (current !== null) {
    if (current === themeId) return true;
    // Defensive: an already-broken chain elsewhere in the data isn't this
    // call's problem to detect — just stop rather than loop forever.
    if (visited.has(current)) return false;
    visited.add(current);
    current = parentByThemeId.get(current) ?? null;
  }
  return false;
}
