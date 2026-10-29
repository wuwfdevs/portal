// Where a reviewer goes next on the scoring screen. Pure, so "Save and go to
// next unscored" is tested without a meeting: the slate's entry ids in display
// order, the ids the reviewer has already scored, and where they are now.

/** The first unscored entry after `current` (wrapping to the top), or null when every entry is scored. */
export function nextUnscoredEntryId(
  order: string[],
  scored: Set<string>,
  current: string | null,
): string | null {
  if (order.length === 0) return null;
  const start = current ? order.indexOf(current) : -1;
  for (let step = 1; step <= order.length; step += 1) {
    const candidate = order[(start + step) % order.length]!;
    if (candidate !== current && !scored.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Which entry the scoring screen opens on: the one the URL names when it is on
 * the slate, else the first unscored one, else the first.
 */
export function selectedEntryId(
  order: string[],
  scored: Set<string>,
  requested: string | null | undefined,
): string | null {
  if (requested && order.includes(requested)) return requested;
  return order.find((id) => !scored.has(id)) ?? order[0] ?? null;
}

/** The entries either side of `current` in display order, for a previous/next pair. */
export function neighbours(
  order: string[],
  current: string | null,
): { previous: string | null; next: string | null } {
  const index = current ? order.indexOf(current) : -1;
  if (index < 0) return { previous: null, next: null };
  return { previous: order[index - 1] ?? null, next: order[index + 1] ?? null };
}

/**
 * The slate's display order: by when each pitch was submitted, oldest first,
 * then by entry id so two pitches submitted in the same instant never swap
 * between renders. `ep_meeting_pitches` records no order of its own.
 */
export function slateOrder<T extends { entry: { id: string }; pitch: { created_at: string } }>(
  slate: T[],
): T[] {
  return [...slate].sort(
    (a, b) =>
      a.pitch.created_at.localeCompare(b.pitch.created_at) || a.entry.id.localeCompare(b.entry.id),
  );
}
