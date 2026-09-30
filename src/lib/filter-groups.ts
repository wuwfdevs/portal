// How a list's filters are laid out (docs/ui-patterns.md, "Filters"). Pure,
// so the rule is tested rather than eyeballed per page.

export interface FilterChip {
  label: string;
  href: string;
  active: boolean;
  count?: number;
}

/**
 * One filter dimension — status, type, area. Its first chip is the reset
 * ("All", "All types"): a group whose first chip is active is not applied.
 */
export interface FilterGroup {
  label: string;
  chips: FilterChip[];
}

/**
 * The most chips a single group may show inline on a wide screen. Past this,
 * or with more than one group, every filter moves behind one Filter button.
 * On a phone they always do.
 */
export const INLINE_FILTER_CHIP_LIMIT = 5;

export function filtersFitInline(groups: FilterGroup[]): boolean {
  return groups.length === 1 && (groups[0]?.chips.length ?? 0) <= INLINE_FILTER_CHIP_LIMIT;
}

/** The active chip's label for each group that isn't on its reset, in group order. */
export function appliedFilterLabels(groups: FilterGroup[]): string[] {
  return groups.flatMap((group) => {
    const index = group.chips.findIndex((chip) => chip.active);
    return index > 0 ? [group.chips[index]!.label] : [];
  });
}
