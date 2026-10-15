import Link from "next/link";
import { cn } from "@/lib/cn";
import { ProgressBar } from "@/components/ui/progress-bar";

export interface StepItem {
  label: string;
  /** Where the step lives; a done step links there, the current and future ones don't. */
  href?: string;
}

/**
 * A numbered step indicator for a multi-screen flow (a new contract's five
 * steps) or a multi-stage one on a single screen (the program-log import's
 * upload, review, confirm). Steps before `current` are done and, when they
 * have an href, link back; the current one is highlighted; later ones are
 * plain. A `current` past the last step marks every step done.
 *
 * `busy` says the current step is working — its marker becomes a spinning
 * ring, and `busyNote` (a few words: "reading the file") follows its label.
 * The ring stops under prefers-reduced-motion; the note is what carries the
 * meaning either way.
 *
 * Below `sm` the strip is one line: every step keeps its marker and its
 * connector, and only the current step shows its label (the others stay in the
 * accessible name), so five steps fit a phone's width instead of wrapping.
 *
 * `phoneBar` goes further for a strip that only reports where a flow stands (a project's five
 * stages, each reachable from its own tab): below `sm` it is one thin `ProgressBar` of steps done,
 * with the current step's name in its accessible value, instead of a row of markers.
 */
export function Steps({
  steps,
  current,
  busy = false,
  busyNote,
  label = "Steps",
  phoneBar = false,
  className,
}: {
  steps: StepItem[];
  current: number;
  busy?: boolean;
  busyNote?: string;
  /** The list's accessible name, when "Steps" is too generic ("Import steps"). */
  label?: string;
  /** Below `sm`, show a single progress bar rather than the markers. */
  phoneBar?: boolean;
  className?: string;
}) {
  const done = Math.min(current, steps.length);
  const bar = phoneBar && (
    <ProgressBar
      className={cn("sm:hidden", className)}
      label={label}
      done={done}
      total={steps.length}
      complete={done === steps.length}
      valueText={
        done === steps.length
          ? `All ${steps.length} steps done`
          : `Step ${done + 1} of ${steps.length}: ${steps[done]?.label}`
      }
    />
  );
  return (
    <>
      {bar}
      <ol
        aria-label={label}
        className={cn(
          "flex max-w-4xl flex-wrap items-center gap-2 sm:gap-3.5",
          phoneBar && "max-sm:hidden",
          className,
        )}
      >
        {steps.map((step, index) => {
          const done = index < current;
          const active = index === current;
          const working = active && busy;
          const marker = working ? (
            <span
              aria-hidden="true"
              className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center text-xs font-bold text-brand-link"
            >
              <span className="absolute inset-0 animate-spin rounded-full border-2 border-brand-surface border-t-brand-primary motion-reduce:animate-none" />
              {index + 1}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold",
                active
                  ? "border-brand-primary bg-brand-primary text-white"
                  : done
                    ? "border-success-border bg-success-bg text-success-fg"
                    : "border-line bg-white text-ink-500",
              )}
            >
              {done ? "✓" : index + 1}
            </span>
          );
          const body = (
            <span
              className={cn(
                "flex items-center gap-2.5 text-[13px] font-semibold",
                active ? "text-ink-900" : "text-ink-500",
              )}
            >
              {marker}
              <span className={cn(!active && "max-sm:sr-only")}>{step.label}</span>
              {working && busyNote && (
                <span className="font-normal text-ink-500">· {busyNote}</span>
              )}
            </span>
          );
          return (
            <li key={step.label} className="flex items-center gap-2 sm:gap-3.5">
              {done && step.href ? (
                <Link href={step.href} className="hover:underline">
                  {body}
                </Link>
              ) : (
                <span aria-current={active ? "step" : undefined} aria-busy={working || undefined}>
                  {body}
                </span>
              )}
              {index < steps.length - 1 && (
                <span aria-hidden="true" className="h-px w-3 bg-line sm:w-8" />
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
