// Backlog-hygiene predicate: which open pitches deserve a "fish or cut bait"
// look. Pure so the thresholds stay unit-testable; the backlog page's Stale
// filter is this function applied to derived activity stats.

export const STALE_AFTER_DAYS = 90;
export const STALE_DEFERRAL_COUNT = 3;

export interface PitchActivity {
  createdAt: string;
  /** Most recent meeting decision touching this pitch, if any. */
  lastReviewedAt: string | null;
  deferralCount: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isStalePitch(activity: PitchActivity, now: Date): boolean {
  if (activity.deferralCount >= STALE_DEFERRAL_COUNT) return true;
  const anchor = new Date(activity.lastReviewedAt ?? activity.createdAt);
  return (now.getTime() - anchor.getTime()) / MS_PER_DAY >= STALE_AFTER_DAYS;
}
