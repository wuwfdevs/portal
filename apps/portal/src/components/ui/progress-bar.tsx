import { cn } from "@/lib/cn";
import { progressPercent, progressValueText } from "@/lib/progress";

const SIZE_CLASSES = { sm: "h-1", md: "h-1.5", lg: "h-2.5" } as const;

export type ProgressBarSize = keyof typeof SIZE_CLASSES;

interface CommonProps {
  /** The bar's own height; `md` is the thin bar the contract screens use. */
  size?: ProgressBarSize;
  /** The accessible name — what is being measured. Callers show their own visible text beside it. */
  label?: string;
  className?: string;
}

interface DeterminateProps extends CommonProps {
  indeterminate?: false;
  done: number;
  pending?: number;
  total: number;
  /** Colours the bar as finished. */
  complete?: boolean;
  /** What a screen reader hears; defaults to "12 of 26, plus 6 pending". */
  valueText?: string;
}

interface IndeterminateProps extends CommonProps {
  /** Work of unknown length (a model reading a file): a sliding segment, no fill. */
  indeterminate: true;
  label: string;
}

/**
 * A thin bar in one of two shapes.
 *
 * Determinate: `done` of `total` in the solid brand blue, plus `pending` in a
 * lighter tint after it (aired plus scheduled against a contract's compiled
 * demand, say). Renders empty at total 0.
 *
 * Indeterminate: a segment that slides along the track, for a step that has no
 * honest percentage — it exposes no value to assistive tech, only that it is
 * busy. The motion stops under prefers-reduced-motion and the segment sits
 * still.
 */
export function ProgressBar(props: DeterminateProps | IndeterminateProps) {
  const { size = "md", label, className } = props;
  const track = cn(
    "relative w-full overflow-hidden rounded-full bg-panel-100",
    SIZE_CLASSES[size],
    className,
  );

  if (props.indeterminate) {
    return (
      <div role="progressbar" aria-label={label} className={track}>
        <span className="absolute inset-y-0 left-0 w-1/3 animate-indeterminate rounded-full bg-brand-link motion-reduce:animate-none" />
      </div>
    );
  }

  const { done, pending = 0, total, complete = false, valueText } = props;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
      aria-valuetext={valueText ?? progressValueText({ done, pending, total })}
      className={track}
    >
      <span
        className={cn("absolute inset-y-0 left-0", complete ? "bg-success-fg" : "bg-brand-link")}
        style={{ width: `${progressPercent(done, total)}%` }}
      />
      {pending > 0 && (
        <span
          className="absolute inset-y-0 bg-brand-primary/45"
          style={{
            left: `${progressPercent(done, total)}%`,
            width: `${progressPercent(pending, total)}%`,
          }}
        />
      )}
    </div>
  );
}
