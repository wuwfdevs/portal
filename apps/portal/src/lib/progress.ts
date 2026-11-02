// Pure helpers for components/ui/progress-bar.tsx: the fill width, and the
// sentence a screen reader hears in place of a bare aria-valuenow (which
// can't say that part of the bar is pending, not done).

/** `value` as a percentage of `total`, clamped to 0–100; 0 when there is no total. */
export function progressPercent(value: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.min(100, Math.max(0, (value / total) * 100));
}

/** "12 of 26" — plus "6 pending" when part of the bar is a lighter, not-yet-done share. */
export function progressValueText({
  done,
  pending = 0,
  total,
}: {
  done: number;
  pending?: number;
  total: number;
}): string {
  if (!(total > 0)) return "Nothing to measure";
  const base = `${done} of ${total}`;
  return pending > 0 ? `${base}, plus ${pending} pending` : base;
}
