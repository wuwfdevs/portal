/**
 * One period's airtime, split into three CSS-width segments proportional to
 * total seconds: protected network time (not actionable), local time
 * actually used, and local time that was available but left unused
 * ("carrying network"). No charting dependency, same spirit as Academic
 * Partnerships' BarList (plain divs, width driven by a percentage) — a
 * stacked variant of the same idea, since here there are three magnitudes
 * to compare within one whole, not one magnitude across rows.
 */
export function TimeBar({
  networkSeconds,
  usedSeconds,
  availableUnusedSeconds,
}: {
  networkSeconds: number;
  usedSeconds: number;
  availableUnusedSeconds: number;
}) {
  const total = Math.max(1, networkSeconds + usedSeconds + availableUnusedSeconds);

  return (
    <span className="flex h-2.5 w-full overflow-hidden rounded-full bg-panel-100">
      <span
        className="h-full bg-ink-400"
        style={{ width: `${(networkSeconds / total) * 100}%` }}
        title="Network (protected)"
      />
      <span
        className="h-full bg-brand-primary"
        style={{ width: `${(usedSeconds / total) * 100}%` }}
        title="Local, used"
      />
      <span
        className="h-full bg-brand-surface"
        style={{ width: `${(availableUnusedSeconds / total) * 100}%` }}
        title="Local, available but unused"
      />
    </span>
  );
}

export function TimeBarLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[11px] text-ink-400">
      <LegendSwatch className="bg-ink-400" label="Network (protected)" />
      <LegendSwatch className="bg-brand-primary" label="Local, used" />
      <LegendSwatch className="bg-brand-surface" label="Local, available but unused" />
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}
