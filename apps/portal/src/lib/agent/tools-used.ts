// The "Used: read piece · replace narration (2)" line under an assistant reply
// (docs/sourcework-analysis-design.md §6.4). Pure, so the client widget can use it.

/** The tools a turn used, in first-use order, with repeats counted. */
export function summarizeToolsUsed(labels: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const label of labels) counts.set(label, (counts.get(label) ?? 0) + 1);
  return [...counts]
    .map(([label, count]) => (count > 1 ? `${label} (${count})` : label))
    .join(" · ");
}
