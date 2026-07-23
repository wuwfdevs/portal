// Tiny display formatters shared by the editorial screens.

export function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatShortDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Compact age for backlog tables: "today", "3d", "34d". */
export function formatAge(value: string, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
  return days <= 0 ? "today" : `${days}d`;
}

/** Scores render with one decimal ("4.0", "3.7"); null as an em dash. */
export function formatScore(value: number | null): string {
  return value === null ? "—" : value.toFixed(1);
}
