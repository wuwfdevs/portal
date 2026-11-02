/**
 * A simple magnitude comparison — one sequential hue (brand-primary), thin
 * rounded bars, the count as a direct label since each row already carries
 * its own name. No new charting dependency: this is CSS width driven off a
 * plain 0–100 percentage, which is all a KPI dashboard at this scale needs.
 */
export function BarList({
  rows,
  emptyLabel,
}: {
  rows: { label: string; count: number }[];
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  if (rows.every((row) => row.count === 0)) {
    return <p className="text-xs text-ink-400">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.label} className="flex items-center gap-3">
          <span className="w-32 shrink-0 truncate text-xs text-ink-600" title={row.label}>
            {row.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-panel-100">
            <span
              className="block h-full rounded-full bg-brand-primary"
              style={{ width: `${(row.count / max) * 100}%` }}
            />
          </span>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-ink-700">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
