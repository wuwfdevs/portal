// Pure logic for picking "the current clock" — no Supabase import, so it's
// testable directly and reusable once rundown generation (a later slice)
// needs the same resolution. ISO date strings ("YYYY-MM-DD") compare
// correctly with plain string comparison, so no Date parsing is needed.

import type { LogClockVersionVariant } from "@/lib/database.types";

export interface ClockVersionLike {
  id: string;
  variant: LogClockVersionVariant;
  effective_from: string;
  effective_to: string | null;
}

/**
 * The version of a given variant in effect on `asOfDate` — the one with the
 * latest effective_from at or before that date, whose effective_to (if set)
 * hasn't passed yet. Returns null if no version of that variant is in effect
 * on that date. Ties on effective_from resolve to whichever appears first in
 * `versions` — callers should pass them in a stable, meaningful order (e.g.
 * as returned by lib/log/queries.ts, ordered by effective_from desc).
 */
export function resolveCurrentClockVersion<T extends ClockVersionLike>(
  versions: T[],
  variant: LogClockVersionVariant,
  asOfDate: string,
): T | null {
  const inEffect = versions.filter(
    (version) =>
      version.variant === variant &&
      version.effective_from <= asOfDate &&
      (version.effective_to === null || version.effective_to >= asOfDate),
  );
  if (inEffect.length === 0) return null;

  return inEffect.reduce((latest, version) =>
    version.effective_from > latest.effective_from ? version : latest,
  );
}
