/** Group, index and tally helpers for rows already in memory. Pure. */

/** Rows grouped by key, each group in the rows' original order. */
export function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const group = groups.get(k);
    if (group) group.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

/** Rows by key; when two rows share a key the later one wins. */
export function indexBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T> {
  return new Map(rows.map((row) => [key(row), row] as const));
}

/** How many rows have each key. */
export function countBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, number> {
  const counts = new Map<K, number>();
  for (const row of rows) {
    const k = key(row);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/** The distinct values of `key`, in first-seen order. */
export function uniqueBy<T, K>(rows: readonly T[], key: (row: T) => K): K[] {
  return [...new Set(rows.map(key))];
}

/** The sum of `value` over the rows. */
export function sumBy<T>(rows: readonly T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}
