import { cn } from "@/lib/cn";

/**
 * A thin two-tone bar: `done` of `total` in the solid brand blue, plus
 * `pending` in a lighter tint after it (aired plus scheduled against a
 * contract's compiled demand, say). Renders empty at total 0.
 */
export function ProgressBar({
  done,
  pending = 0,
  total,
  complete = false,
  className,
}: {
  done: number;
  pending?: number;
  total: number;
  /** Colours the bar as finished. */
  complete?: boolean;
  className?: string;
}) {
  const pct = (n: number) => (total > 0 ? Math.min(100, (n / total) * 100) : 0);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-panel-100", className)}
    >
      <span
        className={cn("absolute inset-y-0 left-0", complete ? "bg-success-fg" : "bg-brand-link")}
        style={{ width: `${pct(done)}%` }}
      />
      {pending > 0 && (
        <span
          className="absolute inset-y-0 bg-brand-primary/45"
          style={{ left: `${pct(done)}%`, width: `${pct(pending)}%` }}
        />
      )}
    </div>
  );
}
