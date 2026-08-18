// Tiny display formatters shared by the editorial screens.

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function daysSince(value: string, now: Date): number {
  return Math.floor((now.getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Conversational age for a list row's meta line ("Maria Chen · 2 days ago"),
 * where the compact "2d" of a table cell reads as a typo rather than a unit.
 */
export function formatAgeLong(value: string, now = new Date()): string {
  const days = daysSince(value, now);
  if (days <= 0) return "today";
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

/**
 * Compact "how long ago" for a trailing status string ("Reviewed 12d ago").
 * Reads as a sentence fragment, so today stays "today" rather than "0d ago".
 */
export function formatAgo(value: string, now = new Date()): string {
  const days = daysSince(value, now);
  return days <= 0 ? "today" : `${days}d ago`;
}

/** Scores render with one decimal ("4.0", "3.7"); null as an em dash. */
export function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}
